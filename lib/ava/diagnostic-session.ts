/**
 * Session de diagnostic matériel (courte durée, conversation).
 * Pas de mémoire longue sans consentement RGPD.
 */
export type CheckAtomizerStep =
  | "CONFIRM_CONTEXT"
  | "ASK_CARTRIDGE_SEATED"
  | "ASK_RESEAT_CARTRIDGE"
  | "ASK_COIL_INSTALLED"
  | "ASK_CONTACTS_CLEAN"
  | "ASK_STILL_SHOWING"
  | "REQUEST_DETAIL_PHOTOS"
  | "SUGGEST_CROSS_TEST"
  | "SHOP_ORIENTATION"
  | "RESOLVED"
  | "EXITED";

export type DiagnosticSession = {
  active: boolean;
  manufacturer: string | null;
  model: string | null;
  identifiedDevice: string | null;
  issueCode: string | null;
  confidence: number;
  confirmedByUser: boolean;
  currentStep: CheckAtomizerStep | string;
  rejectedHypotheses: string[];
  confirmedObservations: string[];
  identifiedComponent: string | null;
  requestedAttachments: string[];
  lastQuestion: string | null;
  awaitingCatalogConfirm: boolean;
  updatedAt: string;
};

export const DIAGNOSTIC_EXIT_PATTERN =
  /probl[eè]me\s+r[eé]solu|c['’]est\s+r[eé]gl[eé]|arr[eê]ter|quitter\s+le\s+diagnostic|revenir\s+aux\s+produits|je\s+veux\s+chercher\s+un\s+produit|retour\s+(au\s+)?catalogue/i;

export const DIAGNOSTIC_PURCHASE_PATTERN =
  /je\s+veux\s+acheter|acheter\s+(un\s+)?(atomiseur|cartouche|r[eé]sistance)|cherche\s+(un\s+)?(atomiseur|cartouche)/i;

export function emptyDiagnosticSession(): DiagnosticSession {
  return {
    active: false,
    manufacturer: null,
    model: null,
    identifiedDevice: null,
    issueCode: null,
    confidence: 0,
    confirmedByUser: false,
    currentStep: "CONFIRM_CONTEXT",
    rejectedHypotheses: [],
    confirmedObservations: [],
    identifiedComponent: null,
    requestedAttachments: [],
    lastQuestion: null,
    awaitingCatalogConfirm: false,
    updatedAt: new Date().toISOString(),
  };
}

export function touchSession(session: DiagnosticSession): DiagnosticSession {
  return { ...session, updatedAt: new Date().toISOString() };
}

export function isDiagnosticExit(message: string): boolean {
  return DIAGNOSTIC_EXIT_PATTERN.test(message);
}

export function isPurchaseIntent(message: string): boolean {
  return DIAGNOSTIC_PURCHASE_PATTERN.test(message);
}

export function parseUserDeviceCorrection(message: string): {
  manufacturer: string;
  model: string;
  identifiedDevice: string;
} | null {
  const t = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (
    /(c['’]est|cest|non\s+c['’]est|plutot|plutôt).{0,20}drag\s*6|drag\s*6|drag\s*vi/.test(t) &&
    !/drag\s*s\s*2|drag\s*5|drag\s*x/.test(t)
  ) {
    return {
      manufacturer: "VOOPOO",
      model: "DRAG 6",
      identifiedDevice: "VOOPOO_DRAG_6",
    };
  }
  if (/voopoo/.test(t) && /drag\s*6|drag\s*vi/.test(t)) {
    return {
      manufacturer: "VOOPOO",
      model: "DRAG 6",
      identifiedDevice: "VOOPOO_DRAG_6",
    };
  }
  return null;
}

export function detectCheckAtomizer(message: string): boolean {
  return /check\s*atomizer|checkatomizer/i.test(message);
}

/** Réponses courtes / négations liées à la dernière question. */
export function interpretShortDiagnosticAnswer(
  message: string,
  lastQuestion: string | null
): {
  kind:
    | "yes"
    | "no"
    | "still_same"
    | "component_atomizer"
    | "component_cartridge"
    | "component_coil"
    | "cleaned"
    | "changed_coil"
    | "unknown";
  note?: string;
} {
  const t = message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();

  if (/^(oui|ok|d['’]accord|yes|c['’]est\s+(bien\s+)?(ca|ça)|oui\s*,?\s*c['’]est)/i.test(t)) {
    return { kind: "yes" };
  }
  if (/^(non|nan|nope|no)$/i.test(t)) return { kind: "no" };

  if (/toujours\s+(pareil|la)|message\s+encore|encore\s+l[aà]|toujours\s+check|ca\s+marche\s+pas|ça\s+marche\s+pas|oui\s+encore|toujours\s+l[aà]/.test(t)) {
    return { kind: "still_same" };
  }
  if (/j['’]ai\s+nettoy|nettoye|nettoyé/.test(t)) return { kind: "cleaned" };
  if (/j['’]ai\s+chang[eé]\s+(la\s+)?r[eé]sistance|chang[eé]\s+(la\s+)?coil/.test(t)) {
    return { kind: "changed_coil" };
  }
  if (/non\s+atomiseur|pas\s+(l['’])?atomiseur|c['’]est\s+pas\s+(l['’])?atomiseur/.test(t)) {
    return { kind: "component_atomizer", note: "rejected_atomizer_label" };
  }
  if (/c['’]est\s+(l['’])?atomiseur|atomiseur/.test(t) && !/acheter|cherche/.test(t)) {
    return { kind: "component_atomizer" };
  }
  if (/c['’]est\s+(la\s+)?cartouche|cartouche/.test(t) && !/acheter|cherche/.test(t)) {
    return { kind: "component_cartridge" };
  }
  if (/c['’]est\s+(la\s+)?r[eé]sistance|r[eé]sistance|coil/.test(t) && !/acheter|cherche/.test(t)) {
    return { kind: "component_coil" };
  }

  // oui/non relatif à la dernière question
  if (lastQuestion && /^(oui|non)\b/.test(t)) {
    return { kind: t.startsWith("oui") ? "yes" : "no" };
  }

  return { kind: "unknown" };
}
