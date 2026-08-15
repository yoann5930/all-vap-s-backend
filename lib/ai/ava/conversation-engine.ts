/**
 * Moteur conversationnel client A.V.A. — états, expertise, anti-répétition, refus.
 * Pas de faux « 15 ans en boutique » : équivalent de conseil, honnêteté sur la nature.
 */
import type { AvaConversationContext, AvaFlavorFamily } from "./types";
import { emptyConversationContext } from "./types";

export type AvaConversationMode =
  | "GENERAL"
  | "PRODUCT_SEARCH"
  | "BEGINNER_GUIDANCE"
  | "DEVICE_ADVICE"
  | "ELIQUID_ADVICE"
  | "COIL_COMPATIBILITY"
  | "SAV"
  | "PHOTO_ANALYSIS"
  | "ORDER_HELP"
  | "STORE_AVAILABILITY";

export type AvaExpertiseLevel = "beginner" | "regular" | "expert";

const MODE_STICKY = new Set<AvaConversationMode>([
  "SAV",
  "COIL_COMPATIBILITY",
  "ELIQUID_ADVICE",
  "PRODUCT_SEARCH",
  "BEGINNER_GUIDANCE",
  "DEVICE_ADVICE",
  "PHOTO_ANALYSIS",
  "ORDER_HELP",
]);

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Détecte un changement explicite de sujet (sortir du mode collant). */
export function isExplicitTopicSwitch(message: string): boolean {
  const t = norm(message);
  return (
    /autre\s+(chose|sujet)|changeons|plutot\s+(un|une)|je\s+(veux|cherche)\s+(plutot|autre)|laisse\s+tomber|autre\s+question/.test(
      t
    ) ||
    (/je\s+(cherche|veux|voudrais)/.test(t) &&
      /(liquide|e-?liquid|resistance|pod|kit|box)/.test(t) &&
      /(fuit|panne|sav|atomizer)/.test(t) === false)
  );
}

export function detectExpertiseLevel(
  message: string,
  prev?: AvaExpertiseLevel | null
): AvaExpertiseLevel {
  const t = norm(message);
  if (
    /je\s+debut|debutant|jamais\s+vape|premiere\s+fois|je\s+connais\s+rien|c['’ ]est\s+quoi/.test(
      t
    )
  ) {
    return "beginner";
  }
  if (
    /\b0[.,]\d+\s*ohm|\b\d+\s*w\b|mesh|mtl|dl\b|rta|rda|rdta|rebuild|kanthal|ni80|ss316|tc\b|bypass/.test(
      t
    )
  ) {
    return "expert";
  }
  return prev || "regular";
}

export function detectConversationMode(
  message: string,
  prevMode: AvaConversationMode | null | undefined,
  opts?: { diagnosticActive?: boolean }
): AvaConversationMode {
  const t = norm(message);

  if (opts?.diagnosticActive) return "SAV";

  if (prevMode && MODE_STICKY.has(prevMode) && !isExplicitTopicSwitch(message)) {
    // Affinements SAV / photo / coil restent dans le mode
    if (prevMode === "SAV") {
      if (/photo|image|joint|airflow|dessous|dessus|remplissage/.test(t)) {
        return /photo|image/.test(t) ? "PHOTO_ANALYSIS" : "SAV";
      }
      return "SAV";
    }
    if (prevMode === "COIL_COMPATIBILITY" && /ohm|resistance|coil|watt|puissance/.test(t)) {
      return "COIL_COMPATIBILITY";
    }
    if (
      (prevMode === "ELIQUID_ADVICE" || prevMode === "PRODUCT_SEARCH") &&
      /(fruit|frais|gourmand|menthe|mg|ml|saveur|liquide|autre|pas\s+celui|trop\s+sucre)/.test(t)
    ) {
      return prevMode === "ELIQUID_ADVICE" ? "ELIQUID_ADVICE" : "PRODUCT_SEARCH";
    }
  }

  if (/commande|colis|livraison|suivi|statut|avant\s+pai|verif(ie|ier)\s+(l['’ ]?)?offre|panier/.test(t) && /twenty|offre|promo|paiement|commande|colis|livraison/.test(t))
    return "ORDER_HELP";
  if (/commande|colis|livraison|suivi|statut/.test(t)) return "ORDER_HELP";
  if (/horaire|ouvert|boutique|magasin|hautmont|quesnoy|adresse|telephone/.test(t)) {
    return "STORE_AVAILABILITY";
  }
  if (
    /fuit|fuite|panne|sav|atomizer|ne\s+s'?allume|go[uû]t\s+de\s+brul|crame|grille|pas\s+de\s+vapeur|check\s*atomizer|ne\s+marche/.test(
      t
    )
  ) {
    return "SAV";
  }
  if (/photo|regarde\s+(ca|ça)|vois\s+(sur|la)\s+photo/.test(t)) return "PHOTO_ANALYSIS";
  if (/je\s+debut|debutant|commencer\s+(la\s+)?vape|premiere\s+cigarette/.test(t)) {
    return "BEGINNER_GUIDANCE";
  }
  if (/resistance|coil|ohm|compatible\s+avec/.test(t)) return "COIL_COMPATIBILITY";
  if (
    /pas\s+trop\s+fort|beaucoup\s+de\s+vapeur|taux\s+de\s+nicotine|\b\d+\s*mg\b|sel\s+de\s+nicotine/.test(
      t
    )
  ) {
    return "ELIQUID_ADVICE";
  }
  if (/pod|box|kit|drag|xros|clearomiseur|materiel|appareil/.test(t) && !/liquide|e-?liquid/.test(t)) {
    return "DEVICE_ADVICE";
  }
  if (/liquide|e-?liquid|saveur|fruit|gourmand|menthe|nicotine|mg\b/.test(t)) {
    return "ELIQUID_ADVICE";
  }
  if (/cherche|montre|trouve|as\s+tu|avez\s+vous|promo|nouveaut/.test(t)) {
    return "PRODUCT_SEARCH";
  }

  return prevMode && MODE_STICKY.has(prevMode) && !isExplicitTopicSwitch(message)
    ? prevMode
    : "GENERAL";
}

/** Parse matériel courant (Drag 6, Xros, etc.). */
export function parseDeviceFromMessage(message: string): {
  manufacturer: string | null;
  deviceModel: string | null;
} {
  const t = norm(message);
  // Correction explicite « pas Drag 5, c'est la 6 »
  if (
    (/c['’ ]est\s+(la\s+)?(drag\s*)?6|plutot\s+(la\s+)?drag\s*6|drag\s*6/.test(t) ||
      /c['’ ]est\s+la\s+6\b/.test(t)) &&
    /pas\s+(une\s+)?drag\s*5|pas\s+la\s+5|correction|non\s+c/.test(t)
  ) {
    return { manufacturer: "VOOPOO", deviceModel: "DRAG 6" };
  }
  if (/drag\s*6|drag\s*vi/.test(t) && !/drag\s*s\s*2|drag\s*5(?!\s*,)|drag\s*x/.test(t)) {
    // « drag 5 » seul bloque ; « drag 6 » gagne si présent sans négation
    if (/drag\s*6/.test(t)) return { manufacturer: "VOOPOO", deviceModel: "DRAG 6" };
  }
  if (/drag\s*6/.test(t)) return { manufacturer: "VOOPOO", deviceModel: "DRAG 6" };
  if (/drag\s*s\s*2/.test(t)) return { manufacturer: "VOOPOO", deviceModel: "DRAG S2" };
  if (/xros\s*4/.test(t)) return { manufacturer: "Vaporesso", deviceModel: "XROS 4" };
  if (/xros\s*3/.test(t)) return { manufacturer: "Vaporesso", deviceModel: "XROS 3" };
  if (/xros\s*2/.test(t)) return { manufacturer: "Vaporesso", deviceModel: "XROS 2" };
  if (/\bxros\b/.test(t)) return { manufacturer: "Vaporesso", deviceModel: "XROS" };
  if (/argus\s*g2/.test(t)) return { manufacturer: "VOOPOO", deviceModel: "ARGUS G2" };
  if (/aegis\s+legend\s*2|legend\s*2/.test(t) && /geekvape|aegis|legend/.test(t)) {
    return { manufacturer: "Geekvape", deviceModel: "Aegis Legend 2" };
  }
  if (/geekvape\s+aegis\s+legend|aegis\s+legend/.test(t)) {
    return { manufacturer: "Geekvape", deviceModel: "Aegis Legend" };
  }
  if (/geekvape\s+aegis|aegis\b/.test(t)) {
    return { manufacturer: "Geekvape", deviceModel: "Aegis" };
  }
  if (/\bz\s*sub[\s-]?ohm\b|\bz\s*subohm\b/.test(t)) {
    return { manufacturer: "Geekvape", deviceModel: "Z Subohm" };
  }
  const m = message.match(
    /\b(vaporesso|voopoo|geekvape|smok|aspire|innokin|lost\s*vape)\s+([a-z0-9][\w\s-]{1,24})/i
  );
  if (m) {
    return {
      manufacturer: m[1].replace(/\s+/g, " "),
      deviceModel: m[2].trim().toUpperCase(),
    };
  }
  return { manufacturer: null, deviceModel: null };
}

export function detectProductRefusal(message: string): boolean {
  const t = norm(message);
  return (
    /pas\s+(celui|celle|ca|ça)|pas\s+celui[- ]la|autre\s+chose|trop\s+(sucre|frais|cher|fort)|j['’ ]aime\s+pas|pas\s+fan|non\s+merci|autre\s+proposition|pas\s+ca/.test(
      t
    )
  );
}

export function isIdentityQuestion(message: string): boolean {
  const t = norm(message);
  return (
    /tu\s+es\s+(une?\s+)?(vraie\s+)?(personne|humaine?)|es[- ]tu\s+(humaine?|une\s+ia|un\s+robot|reelle)|t['’ ]es\s+qui|qui\s+es[- ]tu|tu\s+travailles\s+(en|au)\s+magasin|tu\s+as\s+\d+\s+ans\s+d['’ ]experience/.test(
      t
    )
  );
}

export const AVA_IDENTITY_REPLY =
  "Je suis A.V.A., l'assistante d'All Vap's. Je ne suis pas une personne physique — en revanche je m'appuie sur le catalogue et les procédures boutique pour vous conseiller comme une bonne vendeuse le ferait.";

/** Similarité simple (Jaccard sur tokens) pour anti-répétition. */
export function similarityScore(a: string, b: string): number {
  const ta = new Set(norm(a).split(" ").filter((w) => w.length > 2));
  const tb = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function isTooSimilarToRecent(
  candidate: string,
  recentReplies: string[] | undefined,
  threshold = 0.72
): boolean {
  if (!recentReplies?.length) return false;
  return recentReplies.some((r) => similarityScore(candidate, r) >= threshold);
}

export function dampenRepetition(
  candidate: string,
  recentReplies: string[] | undefined
): string {
  if (!isTooSimilarToRecent(candidate, recentReplies)) return candidate;
  // Raccourcir : garder la dernière phrase utile
  const sentences = candidate
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length >= 2) {
    return sentences.slice(-1)[0];
  }
  return candidate.replace(
    /^(avec plaisir|parfait|d['’]accord|je viens de trouver|j['’]ai trouve)[^.!]*[.!]?\s*/i,
    ""
  ).trim() || "On avance : dites-moi ce qui ne va pas dans ce que je viens de proposer.";
}

export function pushRecentReply(
  ctx: AvaConversationContext,
  reply: string
): AvaConversationContext {
  const prev = ctx.recentReplies ?? [];
  const next = [...prev, reply.slice(0, 400)].slice(-4);
  return { ...ctx, recentReplies: next, lastReplyFingerprint: norm(reply).slice(0, 80) };
}

export function withMode(
  ctx: AvaConversationContext,
  mode: AvaConversationMode,
  expertise: AvaExpertiseLevel
): AvaConversationContext {
  return {
    ...ctx,
    conversationMode: mode,
    expertiseLevel: expertise,
  };
}

/** Clarifications naturelles (une seule question). */
export function naturalClarification(
  kind: "flavor" | "freshness" | "device" | "nicotine",
  expertise: AvaExpertiseLevel,
  deviceKnown?: string | null
): string {
  if (kind === "flavor") {
    return expertise === "beginner"
      ? "Plutôt fruits, gourmand, menthe, ou un goût plus classique ?"
      : "Plutôt fruits rouges, exotique, agrumes ou gourmand ?";
  }
  if (kind === "freshness") {
    return "Frais, un peu frais, ou plutôt sans fraîcheur ?";
  }
  if (kind === "device") {
    if (deviceKnown) {
      return `Pour ${deviceKnown}, vous visez quel ohm environ ?`;
    }
    return expertise === "expert"
      ? "Marque + modèle exact de la box / du pod ?"
      : "C'est quel appareil exactement (marque et modèle) ?";
  }
  return "Vous êtes plutôt sur quel taux de nicotine en ce moment ?";
}

export function applyPersistentMemoryHints(
  ctx: AvaConversationContext,
  memory: {
    preferredFlavors?: string[];
    usualNicotineMg?: number | null;
    preferredBrands?: string[];
    devices?: Array<{ manufacturer: string; model: string }>;
  } | null
): AvaConversationContext {
  if (!memory) return ctx;
  const next = { ...ctx };
  if (!next.deviceModel && memory.devices?.[0]) {
    next.manufacturer = memory.devices[0].manufacturer;
    next.deviceModel = memory.devices[0].model;
  }
  if (next.nicotineMg == null && memory.usualNicotineMg != null) {
    next.nicotineMg = memory.usualNicotineMg;
  }
  if (!next.flavorFamily && memory.preferredFlavors?.length) {
    const f = norm(memory.preferredFlavors[0]);
    if (/menthe/.test(f)) next.flavorFamily = "menthe";
    else if (/gourmand|vanille|caramel/.test(f)) next.flavorFamily = "gourmand";
    else if (/fruit/.test(f)) next.flavorFamily = "fruite";
  }
  if (!next.manufacturer && memory.preferredBrands?.[0]) {
    next.manufacturer = memory.preferredBrands[0];
  }
  return next;
}

export function ensureContext(
  prev: AvaConversationContext | null | undefined,
  preferredStoreId?: AvaConversationContext["preferredStoreId"]
): AvaConversationContext {
  return prev
    ? { ...prev, preferredStoreId: preferredStoreId ?? prev.preferredStoreId }
    : emptyConversationContext(preferredStoreId ?? null);
}

export function formatStoreStockHint(
  preferredStoreId: AvaConversationContext["preferredStoreId"],
  dualAvailable: boolean
): string | null {
  if (!dualAvailable) return null;
  if (preferredStoreId === "hautmont") {
    return "Disponible côté stock All Vap's (vérifié sur Hautmont + Le Quesnoy).";
  }
  if (preferredStoreId === "le-quesnoy") {
    return "Disponible côté stock All Vap's (vérifié sur Le Quesnoy + Hautmont).";
  }
  return null;
}

export function ohmSafeMention(message: string): string | null {
  const m = message.match(/\b(0[.,]\d+)\s*(?:ohm|Ω|ω)?\b/i);
  if (!m) return null;
  return m[1].replace(",", ".");
}
