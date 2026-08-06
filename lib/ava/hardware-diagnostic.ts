/**
 * Orchestration diagnostic matériel + session persistante.
 * Priorité diagnosticSession.active → jamais de retour catalogue implicite.
 */
import { checkHardwareSafety } from "@/lib/ava/hardware-safety";
import { detectHardwareIntent } from "@/lib/ava/hardware-intent-detector";
import { identifyDeviceFromText } from "@/lib/ava/device-identification";
import { matchDeviceError } from "@/lib/ava/device-error-messages";
import {
  isDeviceConfirmed,
  shouldInvalidateDeviceContext,
  type ConfirmedDeviceContext,
} from "@/lib/ava/device-confirmation";
import { pickPhrase, humanSellerPolish } from "@/lib/ava/conversation-style";
import { getCompatibleCoils } from "@/lib/ava/coil-compatibility";
import { isExcludedBrandOrProduct } from "@/lib/ava/problems-knowledge";
import {
  emptyDiagnosticSession,
  interpretShortDiagnosticAnswer,
  isDiagnosticExit,
  isPurchaseIntent,
  parseUserDeviceCorrection,
  detectCheckAtomizer,
  type DiagnosticSession,
} from "@/lib/ava/diagnostic-session";
import {
  progressCheckAtomizer,
  replyForCheckAtomizerStep,
  startCheckAtomizerSession,
  CHECK_ATOMIZER_PHOTO_BUTTONS,
} from "@/lib/ava/check-atomizer-flow";
import { recognizeDeviceFromVisualText } from "@/lib/ava/visual-recognition";
import { findDeviceBySlug } from "@/lib/ava/device-support";

export type DiagnosticPhase =
  | "safety_stop"
  | "need_device"
  | "need_confirm_device"
  | "need_cartridge"
  | "need_media"
  | "step"
  | "shop"
  | "idle"
  | "catalog_confirm";

export type DiagnosticReply = {
  phase: DiagnosticPhase;
  content: string;
  showMediaUploader: boolean;
  showDeviceConfirmation: boolean;
  candidates: ReturnType<typeof identifyDeviceFromText>["candidates"];
  deviceContext: ConfirmedDeviceContext | null;
  diagnosticSession: DiagnosticSession;
  assistanceMode: boolean;
  photoButtons?: ReadonlyArray<{ id: string; label: string }>;
  suggestions?: string[];
  blockProductSearch: boolean;
};

function toReply(
  partial: Omit<DiagnosticReply, "blockProductSearch" | "diagnosticSession"> & {
    diagnosticSession: DiagnosticSession;
  }
): DiagnosticReply {
  return {
    ...partial,
    blockProductSearch: partial.diagnosticSession.active || partial.assistanceMode,
  };
}

export function runHardwareDiagnostic(input: {
  message: string;
  deviceContext: ConfirmedDeviceContext | null;
  diagnosticSession?: DiagnosticSession | null;
}): DiagnosticReply {
  const { message } = input;
  let deviceContext = input.deviceContext;
  let session = input.diagnosticSession?.active
    ? { ...input.diagnosticSession }
    : input.diagnosticSession || emptyDiagnosticSession();

  // Sortie explicite uniquement
  if (session.active && isDiagnosticExit(message)) {
    session = {
      ...session,
      active: false,
      currentStep: "EXITED",
      updatedAt: new Date().toISOString(),
    };
    return toReply({
      phase: "idle",
      content: humanSellerPolish(
        "D'accord, on quitte le diagnostic. Dites-moi si vous voulez chercher un produit ou autre chose."
      ),
      showMediaUploader: false,
      showDeviceConfirmation: false,
      candidates: [],
      deviceContext,
      diagnosticSession: session,
      assistanceMode: false,
      suggestions: ["Voir la boutique", "Nos magasins"],
    });
  }

  // Achat pendant diagnostic → confirmation, ne pas fermer
  if (session.active && isPurchaseIntent(message)) {
    if (!session.awaitingCatalogConfirm) {
      session = {
        ...session,
        awaitingCatalogConfirm: true,
        lastQuestion:
          "Souhaitez-vous vraiment quitter le diagnostic pour chercher un produit à acheter ? Répondez oui pour confirmer, ou non pour continuer le SAV.",
        updatedAt: new Date().toISOString(),
      };
      return toReply({
        phase: "catalog_confirm",
        content: session.lastQuestion!,
        showMediaUploader: true,
        showDeviceConfirmation: false,
        candidates: [],
        deviceContext,
        diagnosticSession: session,
        assistanceMode: true,
        photoButtons: CHECK_ATOMIZER_PHOTO_BUTTONS,
        suggestions: ["Non, continuer le diagnostic", "Oui, chercher un produit"],
      });
    }
    if (/^(oui|yes)\b/i.test(message.trim())) {
      session = {
        ...session,
        active: false,
        awaitingCatalogConfirm: false,
        currentStep: "EXITED",
        updatedAt: new Date().toISOString(),
      };
      return toReply({
        phase: "idle",
        content: "",
        showMediaUploader: false,
        showDeviceConfirmation: false,
        candidates: [],
        deviceContext,
        diagnosticSession: session,
        assistanceMode: false,
      });
    }
    session = {
      ...session,
      awaitingCatalogConfirm: false,
      updatedAt: new Date().toISOString(),
    };
  }

  if (shouldInvalidateDeviceContext(message) && !session.confirmedByUser) {
    deviceContext = null;
  }

  const safety = checkHardwareSafety(message);
  if (safety.danger && safety.message) {
    session = {
      ...session,
      active: true,
      updatedAt: new Date().toISOString(),
    };
    return toReply({
      phase: "safety_stop",
      content: safety.message,
      showMediaUploader: false,
      showDeviceConfirmation: false,
      candidates: [],
      deviceContext,
      diagnosticSession: session,
      assistanceMode: true,
    });
  }

  const excluded = isExcludedBrandOrProduct(message);
  if (excluded.excluded) {
    return toReply({
      phase: "shop",
      content: humanSellerPolish(
        excluded.reason ||
          "Ce type de produit n'est pas pris en charge dans le parcours diagnostic A.V.A.",
      ),
      showMediaUploader: false,
      showDeviceConfirmation: false,
      candidates: [],
      deviceContext,
      diagnosticSession: emptyDiagnosticSession(),
      assistanceMode: true,
    });
  }

  // Correction explicite utilisateur → DRAG 6
  const correction = parseUserDeviceCorrection(message);
  if (correction) {
    deviceContext = {
      manufacturer: correction.manufacturer,
      model: correction.model,
      confirmationMethod: "USER_EXPLICIT_TEXT",
      confirmedAt: new Date().toISOString(),
      confidence: 0.95,
    };
    const hasCheck =
      detectCheckAtomizer(message) ||
      session.issueCode === "CHECK_ATOMIZER" ||
      Boolean(matchDeviceError(message)?.display === "Check Atomizer");
    if (hasCheck || session.active) {
      session = startCheckAtomizerSession({
        manufacturer: correction.manufacturer,
        model: correction.model,
        identifiedDevice: correction.identifiedDevice,
        confidence: 0.95,
        confirmedByUser: true,
      });
      const reply = replyForCheckAtomizerStep(session);
      return toReply({
        phase: "step",
        content: humanSellerPolish(reply.content),
        showMediaUploader: reply.showMediaUploader,
        showDeviceConfirmation: false,
        candidates: [],
        deviceContext,
        diagnosticSession: reply.session,
        assistanceMode: true,
        photoButtons: reply.photoButtons,
        suggestions: reply.suggestions,
      });
    }
    session = {
      ...session,
      active: true,
      manufacturer: correction.manufacturer,
      model: correction.model,
      identifiedDevice: correction.identifiedDevice,
      confirmedByUser: true,
      confidence: 0.95,
      updatedAt: new Date().toISOString(),
    };
  }

  // Session diagnostic active : priorité absolue (même si message court / « atomiseur »)
  if (session.active) {
    if (session.issueCode === "CHECK_ATOMIZER") {
      const short = interpretShortDiagnosticAnswer(message, session.lastQuestion);
      const progressed = progressCheckAtomizer(session, short);
      return toReply({
        phase: "step",
        content: humanSellerPolish(progressed.content),
        showMediaUploader: progressed.showMediaUploader,
        showDeviceConfirmation: false,
        candidates: [],
        deviceContext,
        diagnosticSession: progressed.session,
        assistanceMode: true,
        photoButtons: progressed.photoButtons,
        suggestions: progressed.suggestions,
      });
    }
    // Diagnostic générique actif
    const err = matchDeviceError(message);
    if (err?.display === "Check Atomizer" && deviceContext) {
      session = startCheckAtomizerSession({
        manufacturer: deviceContext.manufacturer,
        model: deviceContext.model,
        identifiedDevice: `${deviceContext.manufacturer}_${deviceContext.model}`
          .toUpperCase()
          .replace(/\s+/g, "_"),
        confidence: deviceContext.confidence,
        confirmedByUser: session.confirmedByUser,
      });
      const reply = replyForCheckAtomizerStep(session);
      return toReply({
        phase: "step",
        content: humanSellerPolish(reply.content),
        showMediaUploader: true,
        showDeviceConfirmation: false,
        candidates: [],
        deviceContext,
        diagnosticSession: reply.session,
        assistanceMode: true,
        photoButtons: reply.photoButtons,
        suggestions: reply.suggestions,
      });
    }
    return toReply({
      phase: "step",
      content: humanSellerPolish(
        session.lastQuestion ||
          `${pickPhrase("reassure", message.length)} On reste sur le diagnostic de votre ${session.manufacturer || ""} ${session.model || "appareil"}. ${message.length < 8 ? "Précisez ce que vous constatez, ou ajoutez une photo." : "Que constatez-vous maintenant ?"}`
      ),
      showMediaUploader: true,
      showDeviceConfirmation: false,
      candidates: [],
      deviceContext,
      diagnosticSession: {
        ...session,
        lastQuestion: session.lastQuestion,
        updatedAt: new Date().toISOString(),
      },
      assistanceMode: true,
      photoButtons: CHECK_ATOMIZER_PHOTO_BUTTONS,
    });
  }

  const intent = detectHardwareIntent(message);
  const visual = recognizeDeviceFromVisualText(message);
  const err = matchDeviceError(message);
  const wantsHardware =
    intent.isHardware ||
    detectCheckAtomizer(message) ||
    visual.matchedCues.length > 0 ||
    Boolean(err);

  if (!wantsHardware) {
    return toReply({
      phase: "idle",
      content: "",
      showMediaUploader: false,
      showDeviceConfirmation: false,
      candidates: [],
      deviceContext,
      diagnosticSession: session,
      assistanceMode: false,
    });
  }

  // Démarrage Check Atomizer + indices DRAG
  if (detectCheckAtomizer(message) || err?.display === "Check Atomizer") {
    if (visual.confirmed || (deviceContext && /drag\s*6/i.test(deviceContext.model))) {
      const ctx: ConfirmedDeviceContext = deviceContext?.model.match(/drag\s*6/i)
        ? deviceContext
        : {
            manufacturer: "VOOPOO",
            model: "DRAG 6",
            confirmationMethod: visual.matchedCues.includes("user_said_drag_6")
              ? "USER_EXPLICIT_TEXT"
              : "CLIENT_UPLOADED_PHOTO",
            confirmedAt: new Date().toISOString(),
            confidence: visual.confidence || 0.9,
          };
      deviceContext = ctx;
      session = startCheckAtomizerSession({
        manufacturer: ctx.manufacturer,
        model: ctx.model,
        identifiedDevice: "VOOPOO_DRAG_6",
        confidence: ctx.confidence,
        confirmedByUser: visual.matchedCues.includes("user_said_drag_6"),
      });
      const reply = replyForCheckAtomizerStep(session);
      return toReply({
        phase: "step",
        content: humanSellerPolish(reply.content),
        showMediaUploader: true,
        showDeviceConfirmation: false,
        candidates: [],
        deviceContext,
        diagnosticSession: reply.session,
        assistanceMode: true,
        photoButtons: reply.photoButtons,
        suggestions: reply.suggestions,
      });
    }

    if (!visual.confirmed && visual.confidence < 0.75) {
      const drag6 = findDeviceBySlug("voopoo-drag-6");
      return toReply({
        phase: "need_confirm_device",
        content: humanSellerPolish(
          `${visual.message} J'ai bien noté « Check Atomizer ». Confirmez-vous qu'il s'agit d'une VOOPOO DRAG 6 ?`
        ),
        showMediaUploader: true,
        showDeviceConfirmation: true,
        candidates: drag6 ? [drag6] : identifyDeviceFromText(message).candidates,
        deviceContext: null,
        diagnosticSession: {
          ...emptyDiagnosticSession(),
          active: true,
          issueCode: "CHECK_ATOMIZER",
          currentStep: "CONFIRM_CONTEXT",
          lastQuestion: "Confirmez-vous le modèle VOOPOO DRAG 6 ?",
          updatedAt: new Date().toISOString(),
        },
        assistanceMode: true,
        suggestions: ["Oui, c'est la Drag 6", "Non, autre modèle", "Ajouter une photo"],
      });
    }
  }

  if (!isDeviceConfirmed(deviceContext)) {
    const id = identifyDeviceFromText(message);
    // Éviter confusion Drag S2 / Drag 5 si le client parle de Drag 6
    const filtered = id.candidates.filter(
      (c) => !(/drag\s*s\s*2|drag\s*5/i.test(c.model) && /drag\s*6/i.test(message))
    );
    const candidates = filtered.length ? filtered : id.candidates;
    const intro = pickPhrase("ack", message.length);
    const mediaHint = pickPhrase("invite_media", message.length + 1);
    session = {
      ...session,
      active: true,
      issueCode: err?.display === "Check Atomizer" ? "CHECK_ATOMIZER" : session.issueCode,
      updatedAt: new Date().toISOString(),
    };
    return toReply({
      phase: id.status === "unknown" ? "need_media" : "need_confirm_device",
      content: humanSellerPolish(
        `${intro} ${id.message} ${mediaHint}${
          err ? ` J'ai noté le message « ${err.display} » — on confirmera d'abord le modèle.` : ""
        }`
      ),
      showMediaUploader: true,
      showDeviceConfirmation: candidates.length > 0,
      candidates,
      deviceContext: null,
      diagnosticSession: session,
      assistanceMode: true,
    });
  }

  if (/résistance|resistance|coil|compatible/.test(message.toLowerCase()) && !session.active) {
    const coils = getCompatibleCoils(deviceContext);
    if (!coils.allowed) {
      return toReply({
        phase: "need_cartridge",
        content: humanSellerPolish(
          "Avant de parler résistance, confirmez la cartouche ou le clearomiseur monté — une même box peut en accepter plusieurs."
        ),
        showMediaUploader: true,
        showDeviceConfirmation: false,
        candidates: [],
        deviceContext,
        diagnosticSession: session,
        assistanceMode: true,
      });
    }
    const names = (coils.coils ?? []).map((c) => c.name).slice(0, 5);
    return toReply({
      phase: "step",
      content: humanSellerPolish(
        names.length
          ? `Voici les résistances compatibles listées pour votre configuration : ${names.join(", ")}. Les détails sont sur votre écran.`
          : "Je n'ai pas encore la liste officielle complète pour cette configuration. Je préfère une vérification en boutique."
      ),
      showMediaUploader: false,
      showDeviceConfirmation: false,
      candidates: [],
      deviceContext,
      diagnosticSession: session,
      assistanceMode: true,
    });
  }

  if (err) {
    if (err.display === "Check Atomizer") {
      session = startCheckAtomizerSession({
        manufacturer: deviceContext.manufacturer,
        model: deviceContext.model,
        identifiedDevice: `${deviceContext.manufacturer}_${deviceContext.model}`
          .toUpperCase()
          .replace(/\s+/g, "_"),
        confidence: deviceContext.confidence,
        confirmedByUser: session.confirmedByUser,
      });
      const reply = replyForCheckAtomizerStep(session);
      return toReply({
        phase: "step",
        content: humanSellerPolish(reply.content),
        showMediaUploader: true,
        showDeviceConfirmation: false,
        candidates: [],
        deviceContext,
        diagnosticSession: reply.session,
        assistanceMode: true,
        photoButtons: reply.photoButtons,
        suggestions: reply.suggestions,
      });
    }
    session = { ...session, active: true, updatedAt: new Date().toISOString() };
    const first = err.safeChecks[0] ?? "On vérifie ensemble.";
    return toReply({
      phase: "step",
      content: humanSellerPolish(`${err.display} : ${err.meaning} Première vérification : ${first}`),
      showMediaUploader: true,
      showDeviceConfirmation: false,
      candidates: [],
      deviceContext,
      diagnosticSession: session,
      assistanceMode: true,
    });
  }

  session = { ...session, active: true, updatedAt: new Date().toISOString() };
  return toReply({
    phase: "step",
    content: humanSellerPolish(
      `${pickPhrase("reassure", message.length)} Quel est le symptôme principal en une phrase ?`
    ),
    showMediaUploader: true,
    showDeviceConfirmation: false,
    candidates: [],
    deviceContext,
    diagnosticSession: session,
    assistanceMode: true,
  });
}
