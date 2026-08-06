/**
 * Parcours CHECK_ATOMIZER — étapes obligatoires, sans diagnostic inventé.
 */
import type { DiagnosticSession, CheckAtomizerStep } from "@/lib/ava/diagnostic-session";
import { touchSession } from "@/lib/ava/diagnostic-session";

export const CHECK_ATOMIZER_HYPOTHESES = [
  "cartouche / atomiseur mal inséré",
  "résistance mal installée",
  "résistance défectueuse",
  "contacts sales ou humides",
  "pin ou contact qui ne fait pas correctement liaison",
  "panne matérielle de la box (seulement après exclusion des causes précédentes)",
] as const;

export const CHECK_ATOMIZER_PHOTO_BUTTONS = [
  { id: "cartridge", label: "Ajouter photo de la cartouche" },
  { id: "coil", label: "Ajouter photo de la résistance" },
  { id: "housing", label: "Ajouter photo du logement" },
  { id: "screen", label: "Ajouter photo de l'écran" },
  { id: "video", label: "Ajouter une vidéo" },
] as const;

const STEP_ORDER: CheckAtomizerStep[] = [
  "CONFIRM_CONTEXT",
  "ASK_CARTRIDGE_SEATED",
  "ASK_RESEAT_CARTRIDGE",
  "ASK_COIL_INSTALLED",
  "ASK_CONTACTS_CLEAN",
  "ASK_STILL_SHOWING",
  "REQUEST_DETAIL_PHOTOS",
  "SUGGEST_CROSS_TEST",
  "SHOP_ORIENTATION",
];

export function startCheckAtomizerSession(partial: {
  manufacturer: string;
  model: string;
  identifiedDevice: string;
  confidence: number;
  confirmedByUser: boolean;
}): DiagnosticSession {
  return touchSession({
    active: true,
    manufacturer: partial.manufacturer,
    model: partial.model,
    identifiedDevice: partial.identifiedDevice,
    issueCode: "CHECK_ATOMIZER",
    confidence: partial.confidence,
    confirmedByUser: partial.confirmedByUser,
    currentStep: "CONFIRM_CONTEXT",
    rejectedHypotheses: [],
    confirmedObservations: [],
    identifiedComponent: null,
    requestedAttachments: [],
    lastQuestion: null,
    awaitingCatalogConfirm: false,
    updatedAt: new Date().toISOString(),
  });
}

function advance(step: CheckAtomizerStep): CheckAtomizerStep {
  const i = STEP_ORDER.indexOf(step);
  if (i < 0 || i >= STEP_ORDER.length - 1) return "SHOP_ORIENTATION";
  return STEP_ORDER[i + 1];
}

export type CheckAtomizerReply = {
  content: string;
  session: DiagnosticSession;
  showMediaUploader: boolean;
  photoButtons: typeof CHECK_ATOMIZER_PHOTO_BUTTONS | [];
  suggestions: string[];
};

export function replyForCheckAtomizerStep(session: DiagnosticSession): CheckAtomizerReply {
  const modelLabel = `${session.manufacturer} ${session.model}`;
  let content = "";
  let showMedia = false;
  let photoButtons: typeof CHECK_ATOMIZER_PHOTO_BUTTONS | [] = [];
  let suggestions = ["Oui", "Non", "Toujours pareil"];
  let lastQuestion: string | null = null;
  let step = session.currentStep as CheckAtomizerStep;

  switch (step) {
    case "CONFIRM_CONTEXT":
      content = `Je reconnais une ${modelLabel}. Le message « Check Atomizer » indique que la box ne détecte pas correctement l'atomiseur ou la résistance. Je vais vous guider étape par étape.`;
      lastQuestion = "La cartouche ou l'atomiseur est-il bien en place ?";
      content += ` ${lastQuestion}`;
      step = "ASK_CARTRIDGE_SEATED";
      break;
    case "ASK_CARTRIDGE_SEATED":
      lastQuestion = "La cartouche ou l'atomiseur est-il bien en place ?";
      content = lastQuestion;
      break;
    case "ASK_RESEAT_CARTRIDGE":
      lastQuestion = "Pouvez-vous retirer puis remettre la cartouche fermement, puis me dire si le message reste affiché ?";
      content = lastQuestion;
      break;
    case "ASK_COIL_INSTALLED":
      lastQuestion =
        "Si la résistance est remplaçable, est-elle correctement vissée / clipsée jusqu'au bout ?";
      content = lastQuestion;
      break;
    case "ASK_CONTACTS_CLEAN":
      lastQuestion =
        "Les contacts (plots) sont-ils propres et secs, sans liquide ni dépôt visible ?";
      content = lastQuestion;
      break;
    case "ASK_STILL_SHOWING":
      lastQuestion = "Le message « Check Atomizer » est-il toujours affiché ?";
      content = lastQuestion;
      break;
    case "REQUEST_DETAIL_PHOTOS":
      content =
        "D'accord. Pour aller plus loin sans inventer de panne, j'ai besoin de photos précises : cartouche/atomiseur retiré, dessous de la cartouche, résistance, logement supérieur de la box, et l'écran avec le message. Aucune facture ni justificatif.";
      lastQuestion = "Pouvez-vous ajouter ces photos ?";
      showMedia = true;
      photoButtons = CHECK_ATOMIZER_PHOTO_BUTTONS;
      suggestions = ["Ajouter photo de la cartouche", "Ajouter photo de l'écran", "Toujours pareil"];
      break;
    case "SUGGEST_CROSS_TEST":
      content =
        "Si vous avez une autre résistance ou cartouche compatible, un test croisé peut aider — uniquement si vous en avez déjà une, sans obligation d'achat.";
      lastQuestion = "Avez-vous une autre cartouche / résistance compatible à tester ?";
      showMedia = true;
      photoButtons = CHECK_ATOMIZER_PHOTO_BUTTONS;
      break;
    case "SHOP_ORIENTATION":
      content =
        "Après ces vérifications, le message persiste. Un passage en boutique ou SAV peut être nécessaire pour tester le matériel. Je n'affirme pas que la box est en panne : d'autres causes restent possibles. On peut continuer le diagnostic ou préparer votre visite.";
      lastQuestion = null;
      showMedia = true;
      photoButtons = CHECK_ATOMIZER_PHOTO_BUTTONS;
      suggestions = ["Continuer le diagnostic", "Nos magasins", "Problème résolu"];
      break;
    case "RESOLVED":
      content = "Parfait — content que ce soit réglé. Si le message revient, on reprendra au même modèle.";
      suggestions = ["Voir la boutique", "Autre question"];
      break;
    default:
      content = "On continue le diagnostic sur votre appareil. Que constatez-vous maintenant ?";
      showMedia = true;
  }

  const next: DiagnosticSession = touchSession({
    ...session,
    active: step !== "RESOLVED" && step !== "EXITED",
    currentStep: step,
    lastQuestion,
    requestedAttachments:
      step === "REQUEST_DETAIL_PHOTOS" || step === "SUGGEST_CROSS_TEST" || step === "SHOP_ORIENTATION"
        ? ["cartridge", "coil", "housing", "screen", "video"]
        : session.requestedAttachments,
  });

  return {
    content,
    session: next,
    showMediaUploader: showMedia || next.active,
    photoButtons,
    suggestions,
  };
}

export function progressCheckAtomizer(
  session: DiagnosticSession,
  answer: {
    kind: string;
    note?: string;
  }
): CheckAtomizerReply {
  let s = { ...session };
  const step = s.currentStep as CheckAtomizerStep;

  if (answer.kind === "component_atomizer" && answer.note === "rejected_atomizer_label") {
    s.rejectedHypotheses = [...new Set([...s.rejectedHypotheses, "label_atomizer_alone"])];
    s.confirmedObservations = [...s.confirmedObservations, "client_précise_pas_seulement_atomiseur"];
    s.identifiedComponent = s.identifiedComponent || "à_clarifier";
  } else if (answer.kind === "component_atomizer") {
    s.identifiedComponent = "atomiseur";
    s.confirmedObservations = [...s.confirmedObservations, "composant:atomiseur"];
  } else if (answer.kind === "component_cartridge") {
    s.identifiedComponent = "cartouche";
    s.confirmedObservations = [...s.confirmedObservations, "composant:cartouche"];
  } else if (answer.kind === "component_coil") {
    s.identifiedComponent = "résistance";
    s.confirmedObservations = [...s.confirmedObservations, "composant:résistance"];
  }

  if (answer.kind === "still_same" || (answer.kind === "yes" && step === "ASK_STILL_SHOWING")) {
    s.currentStep = advance(step === "ASK_STILL_SHOWING" ? "ASK_STILL_SHOWING" : step);
    if (step === "ASK_STILL_SHOWING") s.currentStep = "REQUEST_DETAIL_PHOTOS";
    else if (step === "REQUEST_DETAIL_PHOTOS") s.currentStep = "SUGGEST_CROSS_TEST";
    else if (step === "SUGGEST_CROSS_TEST") s.currentStep = "SHOP_ORIENTATION";
    else s.currentStep = advance(step);
    return replyForCheckAtomizerStep(s);
  }

  if (answer.kind === "no" && step === "ASK_STILL_SHOWING") {
    s.currentStep = "RESOLVED";
    s.confirmedObservations = [...s.confirmedObservations, "message_disparu"];
    return replyForCheckAtomizerStep(s);
  }

  if (answer.kind === "yes" || answer.kind === "cleaned" || answer.kind === "changed_coil") {
    if (step === "ASK_CARTRIDGE_SEATED") s.currentStep = "ASK_RESEAT_CARTRIDGE";
    else if (step === "ASK_RESEAT_CARTRIDGE") s.currentStep = "ASK_COIL_INSTALLED";
    else if (step === "ASK_COIL_INSTALLED") s.currentStep = "ASK_CONTACTS_CLEAN";
    else if (step === "ASK_CONTACTS_CLEAN") s.currentStep = "ASK_STILL_SHOWING";
    else s.currentStep = advance(step);
    return replyForCheckAtomizerStep(s);
  }

  if (answer.kind === "no") {
    if (step === "ASK_CARTRIDGE_SEATED") {
      s.currentStep = "ASK_RESEAT_CARTRIDGE";
      s.confirmedObservations = [...s.confirmedObservations, "cartouche_pas_bien_en_place"];
    } else if (step === "ASK_COIL_INSTALLED") {
      s.currentStep = "ASK_COIL_INSTALLED";
      return {
        content:
          "D'accord — remettez la résistance correctement (sans forcer), puis dites-moi si « Check Atomizer » reste affiché.",
        session: touchSession({ ...s, lastQuestion: "Le message est-il toujours là ?" }),
        showMediaUploader: true,
        photoButtons: [],
        suggestions: ["Oui", "Non", "Toujours pareil"],
      };
    } else if (step === "ASK_CONTACTS_CLEAN") {
      s.currentStep = "ASK_CONTACTS_CLEAN";
      return {
        content:
          "Nettoyez délicatement les contacts (secs, sans liquide). Ne démontez pas la box. Ensuite, le message est-il encore là ?",
        session: touchSession({ ...s, lastQuestion: "Message encore affiché ?" }),
        showMediaUploader: true,
        photoButtons: [],
        suggestions: ["Oui", "Non", "J'ai nettoyé"],
      };
    } else {
      s.currentStep = advance(step);
    }
    return replyForCheckAtomizerStep(s);
  }

  // unknown — rester sur l'étape, reformuler
  return replyForCheckAtomizerStep(s);
}
