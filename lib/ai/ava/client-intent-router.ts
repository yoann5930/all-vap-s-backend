/**
 * Routeur d’intention A.V.A. Client — avant tout appel catalogue.
 */
import type { AvaConversationContext } from "./types";
import { detectConversationMode, type AvaConversationMode } from "./conversation-engine";
import { detectAgeIntent } from "./age-intent";
import { isExplicitReplyInstruction } from "@/lib/ava/admin-social/explicit-reply";

export type ClientIntent =
  | "SOCIAL_GREETING"
  | "SOCIAL_SMALLTALK"
  | "PRODUCT_SEARCH"
  | "ELIQUID_ADVICE"
  | "DEVICE_ADVICE"
  | "COIL_COMPATIBILITY"
  | "SAV"
  | "STORE_AVAILABILITY"
  | "PRICE_QUERY"
  | "FOLLOW_UP"
  | "CORRECTION"
  | "AGE_SAFETY"
  | "EXPLICIT_REPLY"
  | "GENERAL";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSocialGreeting(message: string): boolean {
  const t = norm(message);
  return /^(salut|hello|bonjour|bonsoir|hey|coucou|yo|hi|slt|bjr)\s*[!?.]*\s*$/.test(t);
}

export function isSocialSmalltalk(message: string): boolean {
  const t = norm(message);
  return (
    /^(ca\s+va|comment\s+ca\s+va|comment\s+vas[- ]tu|quoi\s+de\s+neuf|tu\s+vas\s+bien)\b/.test(
      t
    ) ||
    /^(ca\s+va\s*\?|comment\s+allez[- ]vous)/.test(t) ||
    /^et\s+toi\s*\??$/.test(t)
  );
}

export function isCorrectionMessage(message: string): boolean {
  const t = norm(message);
  return (
    /\bje\s+me\s+suis\s+trompe\b/.test(t) ||
    /\bnon\s*,?\s*(c[' ]est|je)\b/.test(t) ||
    /\bc[' ]est\s+(pas|plutot)\b/.test(t) ||
    /\bpas\s+(une?\s+)?(xros|drag|legend|aegis)\b/.test(t) ||
    /\bau\s+lieu\b|\bcorrection\b|\bplutot\s+(une?\s+)?/.test(t)
  );
}

export function detectClientIntent(
  message: string,
  prev: AvaConversationContext | null | undefined
): ClientIntent {
  if (detectAgeIntent(message) === "underage") return "AGE_SAFETY";

  // Avant toute recherche catalogue (évite « produit introuvable » sur un smoke PONG)
  if (isExplicitReplyInstruction(message)) return "EXPLICIT_REPLY";

  if (isSocialGreeting(message)) return "SOCIAL_GREETING";
  if (isSocialSmalltalk(message)) return "SOCIAL_SMALLTALK";

  if (isCorrectionMessage(message)) return "CORRECTION";

  const t = norm(message);
  if (/\bprix\b|\bcombien\b|\bcout[eé]?\b/.test(t)) return "PRICE_QUERY";

  // Follow-up boutique (« et à Hautmont ? »)
  if (
    /^(et\s+)?(a|au|a\s+la)\s+(hautmont|quesnoy|le\s+quesnoy)\b/.test(t) ||
    /\bet\s+(a|au)\s+(hautmont|quesnoy)/.test(t)
  ) {
    return "FOLLOW_UP";
  }

  const prevMode = (prev as { conversationMode?: AvaConversationMode } | null)?.conversationMode;
  const mode = detectConversationMode(message, prevMode ?? null, {
    diagnosticActive: Boolean(prev?.diagnosticSession),
  });

  switch (mode) {
    case "SAV":
    case "PHOTO_ANALYSIS":
      return "SAV";
    case "COIL_COMPATIBILITY":
      return "COIL_COMPATIBILITY";
    case "ELIQUID_ADVICE":
      return "ELIQUID_ADVICE";
    case "DEVICE_ADVICE":
      return "DEVICE_ADVICE";
    case "STORE_AVAILABILITY":
      return "STORE_AVAILABILITY";
    case "PRODUCT_SEARCH":
    case "BEGINNER_GUIDANCE":
      return "PRODUCT_SEARCH";
    default:
      return "GENERAL";
  }
}

export function socialReplyForIntent(intent: "SOCIAL_GREETING" | "SOCIAL_SMALLTALK"): string {
  if (intent === "SOCIAL_GREETING") {
    const opts = [
      "Salut ! Je suis A.V.A. Tu cherches un liquide, du matériel, ou un coup de main SAV ?",
      "Hello ! Dis-moi ce dont tu as besoin, je regarde dans le catalogue All Vap's.",
      "Salut ! Je t’écoute — saveur, kit, résistance…",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  const opts = [
    "Oui ça va, merci ! Et toi — tu cherches quelque chose en particulier ?",
    "Tranquille, merci. Je peux t’aider sur un liquide, du matos ou un souci technique.",
    "Oui, nickel. Qu’est-ce que tu vises aujourd’hui ?",
  ];
  return opts[Math.floor(Math.random() * opts.length)];
}
