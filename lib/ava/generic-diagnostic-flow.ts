/**
 * Parcours diagnostic générique (hors Check Atomizer dédié).
 * S'appuie sur la mémoire SAV (problèmes → contrôles → boutique).
 */
import type { DiagnosticSession } from "@/lib/ava/diagnostic-session";
import { touchSession } from "@/lib/ava/diagnostic-session";
import { matchDeviceError } from "@/lib/ava/device-error-messages";
import { CHECK_ATOMIZER_PHOTO_BUTTONS } from "@/lib/ava/check-atomizer-flow";
import {
  formatClientSolution,
  formatShopOrientation,
  getSafeChecksFromSav,
  matchSavProblems,
  resolveSavForSymptomKey,
} from "@/lib/ava/sav-memory";

export type GenericStep =
  | "NEED_DEVICE"
  | "CONFIRM_DEVICE"
  | "ASK_SYMPTOM"
  | "SAFE_CHECK"
  | "ASK_RESULT"
  | "ASK_MEDIA"
  | "SHOP_ORIENTATION"
  | "RESOLVED";

/** Fallback local si mémoire SAV indisponible */
const SYMPTOM_CHECKS_FALLBACK: Record<string, string[]> = {
  fuite: [
    "Vérifiez que la cartouche / le clearomiseur est bien clipsé et que vous n'avez pas trop rempli.",
    "Essuyez les contacts et le filetage, puis remontez à sec. La fuite continue-t-elle ?",
  ],
  "gout-brule": [
    "Baissez un peu la puissance et vérifiez qu'il reste du liquide.",
    "Si la résistance est ancienne ou mal amorcée, remplacez-la ou ré-amorcez. Le goût brûlé est-il toujours là ?",
  ],
  "pas-vapeur": [
    "Déverrouillez l'appareil (souvent 5 clics) et contrôlez le niveau de liquide.",
    "Retirez puis remettez la cartouche. Avez-vous à nouveau de la vapeur ?",
  ],
  charge: [
    "Testez un autre câble / chargeur adaptés. L'appareil ne doit pas chauffer anormalement.",
    "Le voyant ou l'écran indique-t-il encore une charge ?",
  ],
  allumage: [
    "Chargez quelques minutes, puis réessayez d'allumer.",
    "L'appareil s'allume-t-il maintenant ?",
  ],
  generic: [
    "Retirez puis remettez fermement la cartouche / l'atomiseur, contacts propres et secs.",
    "Après ce geste, le problème est-il toujours là ?",
  ],
};

function checksForSymptom(symptom: string): string[] {
  const fromSav = getSafeChecksFromSav(symptom);
  if (fromSav.length >= 2) return fromSav;
  return SYMPTOM_CHECKS_FALLBACK[symptom] || SYMPTOM_CHECKS_FALLBACK.generic;
}

export function detectSymptomKey(message: string): string {
  const t = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (/fuit|leak|coule/.test(t)) return "fuite";
  if (/brul|burnt|dry\s*hit/.test(t)) return "gout-brule";
  if (/pas de vapeur|plus de vapeur|peu de vapeur|aucune vapeur/.test(t)) return "pas-vapeur";
  if (/charge|batterie faible|ne charge/.test(t)) return "charge";
  if (/allume|s'allume|sallume|demarre|démarre/.test(t)) return "allumage";
  if (/check\s*atomizer|no\s*atomizer/.test(t)) return "atomizer";
  const sav = matchSavProblems(message, 1)[0];
  if (sav) {
    if (sav.probleme_id === "leak") return "fuite";
    if (sav.probleme_id === "burnt_taste") return "gout-brule";
    if (sav.probleme_id === "no_charge") return "charge";
    if (sav.probleme_id === "no_power") return "allumage";
    if (sav.probleme_id === "no_atomizer") return "atomizer";
    return sav.probleme_id;
  }
  const err = matchDeviceError(message);
  if (err) return "generic";
  return "generic";
}

export function startGenericSession(partial?: {
  manufacturer?: string | null;
  model?: string | null;
  symptomKey?: string | null;
  confirmedByUser?: boolean;
}): DiagnosticSession {
  const hasDevice = Boolean(partial?.manufacturer && partial?.model);
  return touchSession({
    active: true,
    manufacturer: partial?.manufacturer ?? null,
    model: partial?.model ?? null,
    identifiedDevice:
      partial?.manufacturer && partial?.model
        ? `${partial.manufacturer}_${partial.model}`.toUpperCase().replace(/\s+/g, "_")
        : null,
    issueCode: partial?.symptomKey ? `GENERIC:${partial.symptomKey}` : "GENERIC",
    confidence: hasDevice ? 0.8 : 0.3,
    confirmedByUser: Boolean(partial?.confirmedByUser && hasDevice),
    currentStep: hasDevice ? (partial?.symptomKey ? "SAFE_CHECK" : "ASK_SYMPTOM") : "NEED_DEVICE",
    rejectedHypotheses: [],
    confirmedObservations: partial?.symptomKey ? [`symptom:${partial.symptomKey}`] : [],
    identifiedComponent: null,
    requestedAttachments: [],
    lastQuestion: null,
    awaitingCatalogConfirm: false,
    updatedAt: new Date().toISOString(),
  });
}

export type GenericReply = {
  content: string;
  session: DiagnosticSession;
  showMediaUploader: boolean;
  showDeviceConfirmation: boolean;
  photoButtons: typeof CHECK_ATOMIZER_PHOTO_BUTTONS | [];
  suggestions: string[];
};

function symptomFromSession(session: DiagnosticSession): string {
  const fromCode = session.issueCode?.startsWith("GENERIC:")
    ? session.issueCode.slice("GENERIC:".length)
    : null;
  const fromObs = session.confirmedObservations
    .find((o) => o.startsWith("symptom:"))
    ?.replace("symptom:", "");
  return fromCode || fromObs || "generic";
}

function checkIndex(session: DiagnosticSession): number {
  const raw = session.confirmedObservations.find((o) => o.startsWith("checkIndex:"));
  return raw ? Number(raw.replace("checkIndex:", "")) || 0 : 0;
}

function setCheckIndex(session: DiagnosticSession, idx: number): DiagnosticSession {
  const rest = session.confirmedObservations.filter((o) => !o.startsWith("checkIndex:"));
  return {
    ...session,
    confirmedObservations: [...rest, `checkIndex:${idx}`],
  };
}

export function replyForGenericStep(session: DiagnosticSession): GenericReply {
  const step = session.currentStep as GenericStep;
  const modelLabel =
    session.manufacturer && session.model
      ? `${session.manufacturer} ${session.model}`
      : "votre appareil";
  const symptom = symptomFromSession(session);
  const checks = checksForSymptom(symptom);
  const sav = resolveSavForSymptomKey(symptom) || matchSavProblems(symptom, 1)[0];
  const idx = checkIndex(session);

  let content = "";
  let lastQuestion: string | null = null;
  let showMedia = false;
  let showConfirm = false;
  let suggestions = ["Oui", "Non", "Toujours pareil", "Problème résolu"];
  let nextStep = step;
  let s = { ...session };

  switch (step) {
    case "NEED_DEVICE":
      content =
        "Pour avancer sans me tromper, j'ai besoin du modèle. Dites-moi la marque et le modèle, ou envoyez une photo de face.";
      lastQuestion = "Quel est le modèle exact de votre appareil ?";
      showMedia = true;
      showConfirm = true;
      suggestions = ["Ajouter une photo", "C'est une Drag 6", "C'est un Xros", "Problème résolu"];
      break;
    case "CONFIRM_DEVICE":
      content = `Je pense à ${modelLabel}. Confirmez-vous que c'est bien votre matériel ?`;
      lastQuestion = `Confirmez-vous ${modelLabel} ?`;
      showConfirm = true;
      showMedia = true;
      suggestions = ["Oui, c'est ça", "Non, autre modèle", "Ajouter une photo"];
      break;
    case "ASK_SYMPTOM":
      content = `D'accord pour ${modelLabel}. Quel est le symptôme principal en une phrase (fuite, Check Atomizer, goût brûlé, pas de vapeur…) ?`;
      lastQuestion = "Quel symptôme constatez-vous ?";
      suggestions = ["Ça fuit", "Check Atomizer", "Goût de brûlé", "Pas de vapeur"];
      break;
    case "SAFE_CHECK": {
      const line = checks[Math.min(idx, checks.length - 1)];
      const intro = idx === 0 && sav ? `Mémoire SAV — ${sav.probleme}. ` : "";
      content = `${intro}${line}`;
      lastQuestion = "Est-ce que le problème est toujours là après ce geste ?";
      suggestions = ["C'est résolu", "Toujours pareil", "Non plus", "Oui encore"];
      break;
    }
    case "ASK_RESULT":
      content = "Dites-moi franchement : le souci a disparu, ou c'est toujours pareil ?";
      lastQuestion = "Problème résolu ou toujours présent ?";
      suggestions = ["Problème résolu", "Toujours pareil", "Ajouter une photo"];
      break;
    case "ASK_MEDIA":
      content =
        "Pour aller plus loin sans inventer de panne, une photo de face + une photo de l'écran ou de la cartouche m'aiderait. Aucune facture demandée.";
      lastQuestion = "Pouvez-vous ajouter une photo ?";
      showMedia = true;
      suggestions = ["Ajouter une photo", "Toujours pareil", "Nos magasins", "Problème résolu"];
      break;
    case "SHOP_ORIENTATION":
      content = `${formatShopOrientation(sav || null)} ${formatClientSolution(sav || null)}`;
      lastQuestion = null;
      showMedia = true;
      suggestions = ["Nos magasins", "Continuer le diagnostic", "Problème résolu"];
      nextStep = "SHOP_ORIENTATION";
      break;
    case "RESOLVED":
      content = "Parfait, content que ce soit réglé. Si ça revient, on reprendra au même modèle.";
      suggestions = ["Voir la boutique", "Autre question"];
      s.active = false;
      break;
    default:
      content = "On avance sur le diagnostic. Que constatez-vous maintenant ?";
      lastQuestion = "Que constatez-vous ?";
      showMedia = true;
  }

  s = touchSession({
    ...s,
    currentStep: nextStep,
    lastQuestion,
    active: nextStep !== "RESOLVED",
  });

  return {
    content,
    session: s,
    showMediaUploader: showMedia || s.active,
    showDeviceConfirmation: showConfirm,
    photoButtons: showMedia ? CHECK_ATOMIZER_PHOTO_BUTTONS : [],
    suggestions,
  };
}

export function progressGenericDiagnostic(
  session: DiagnosticSession,
  answer: { kind: string },
  message: string
): GenericReply {
  let s = { ...session };
  const step = s.currentStep as GenericStep;
  const symptomFromMsg = detectSymptomKey(message);
  if (symptomFromMsg !== "generic" || /fuit|brul|vapeur|atomizer|charge/i.test(message)) {
    const key = symptomFromMsg;
    s.issueCode = `GENERIC:${key}`;
    if (!s.confirmedObservations.some((o) => o.startsWith("symptom:"))) {
      s.confirmedObservations = [...s.confirmedObservations, `symptom:${key}`];
    }
  }

  if (answer.kind === "yes" || answer.kind === "cleaned" || answer.kind === "changed_coil") {
    if (step === "CONFIRM_DEVICE") {
      s.confirmedByUser = true;
      s.currentStep = s.confirmedObservations.some((o) => o.startsWith("symptom:"))
        ? "SAFE_CHECK"
        : "ASK_SYMPTOM";
      return replyForGenericStep(s);
    }
    if (step === "SAFE_CHECK" || step === "ASK_RESULT") {
      const idx = checkIndex(s);
      const symptom = symptomFromSession(s);
      const checks = checksForSymptom(symptom);
      if (idx + 1 < checks.length) {
        s = setCheckIndex(s, idx + 1);
        s.currentStep = "SAFE_CHECK";
      } else {
        s.currentStep = "ASK_MEDIA";
      }
      return replyForGenericStep(s);
    }
    if (step === "ASK_MEDIA") {
      s.currentStep = "SHOP_ORIENTATION";
      return replyForGenericStep(s);
    }
    s.currentStep = step === "NEED_DEVICE" ? "NEED_DEVICE" : "SAFE_CHECK";
    return replyForGenericStep(s);
  }

  if (answer.kind === "no") {
    if (step === "SAFE_CHECK" || step === "ASK_RESULT") {
      s.currentStep = "RESOLVED";
      return replyForGenericStep(s);
    }
    if (step === "CONFIRM_DEVICE") {
      s.manufacturer = null;
      s.model = null;
      s.confirmedByUser = false;
      s.currentStep = "NEED_DEVICE";
      return replyForGenericStep(s);
    }
  }

  if (answer.kind === "still_same") {
    const idx = checkIndex(s);
    const symptom = symptomFromSession(s);
    const checks = checksForSymptom(symptom);
    if (step === "SAFE_CHECK" && idx + 1 < checks.length) {
      s = setCheckIndex(s, idx + 1);
      s.currentStep = "SAFE_CHECK";
    } else if (step === "ASK_MEDIA" || step === "SAFE_CHECK") {
      s.currentStep = step === "ASK_MEDIA" ? "SHOP_ORIENTATION" : "ASK_MEDIA";
    } else {
      s.currentStep = "SAFE_CHECK";
    }
    return replyForGenericStep(s);
  }

  if (step === "ASK_SYMPTOM" || step === "NEED_DEVICE" || step === "CONFIRM_DEVICE") {
    if (/fuit|brul|vapeur|atomizer|charge|allume|erreur|marche pas|panne|sav/i.test(message)) {
      s.issueCode = `GENERIC:${detectSymptomKey(message)}`;
      s.confirmedObservations = [
        ...s.confirmedObservations.filter((o) => !o.startsWith("symptom:")),
        `symptom:${detectSymptomKey(message)}`,
      ];
      if (s.manufacturer && s.model && s.confirmedByUser) {
        s = setCheckIndex(s, 0);
        s.currentStep = "SAFE_CHECK";
      } else if (s.manufacturer && s.model) {
        s.currentStep = "CONFIRM_DEVICE";
      } else {
        s.currentStep = "NEED_DEVICE";
      }
      return replyForGenericStep(s);
    }
  }

  if (step === "NEED_DEVICE") {
    return {
      content:
        "Je n'ai pas encore le modèle. Écrivez par exemple « Voopoo Drag 6 » ou « Vaporesso Xros 3 », ou ajoutez une photo.",
      session: touchSession({
        ...s,
        lastQuestion: "Quel est le modèle ?",
      }),
      showMediaUploader: true,
      showDeviceConfirmation: true,
      photoButtons: CHECK_ATOMIZER_PHOTO_BUTTONS,
      suggestions: ["Ajouter une photo", "C'est une Drag 6", "Problème résolu"],
    };
  }

  return replyForGenericStep(s);
}
