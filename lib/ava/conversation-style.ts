/**
 * Style conversationnel AVA — vendeuse humaine, jamais robot call-center.
 */
export const FORBIDDEN_ROBOT_PHRASES = [
  /votre demande a bien été prise en compte/i,
  /veuillez fournir davantage d['’]informations/i,
  /voici les résultats correspondant à votre requête/i,
  /en tant qu['’]assistante virtuelle/i,
  /je suis une intelligence artificielle/i,
  /une erreur est survenue lors du traitement de votre demande/i,
] as const;

export type ConversationTone =
  | "greeting"
  | "ack"
  | "reassure"
  | "ask_one"
  | "invite_media"
  | "invite_text"
  | "confirm"
  | "shop_redirect"
  | "safety";

const PHRASE_BANK: Record<ConversationTone, readonly string[]> = {
  greeting: [
    "Bonjour, je m'appelle Ava. Comment puis-je vous aider aujourd'hui ?",
    "Bonjour ! Dites-moi ce que vous recherchez.",
    "Bienvenue chez All Vap's — je suis Ava, à votre écoute.",
  ],
  ack: [
    "D'accord, dites-moi ce qui se passe.",
    "On va regarder ça ensemble.",
    "Je vous écoute.",
    "Très bien, je suis avec vous.",
  ],
  reassure: [
    "Pas d'inquiétude, je vais vous aider à vérifier.",
    "Prenez votre temps.",
    "On avance étape par étape.",
  ],
  ask_one: [
    "Je pense avoir compris, mais je préfère vérifier un point.",
    "Pour bien vous aider, j'ai une petite question.",
    "Un détail m'aiderait beaucoup.",
  ],
  invite_media: [
    "Vous pouvez me montrer votre matériel ?",
    "Une photo m'aiderait beaucoup.",
    "Si c'est plus simple, envoyez-moi une photo de face.",
  ],
  invite_text: [
    "Vous pouvez aussi me l'écrire.",
    "On peut continuer par écrit, aucun souci.",
    "Le clavier est juste en dessous si vous préférez.",
  ],
  confirm: [
    "Est-ce bien ce modèle ?",
    "Je veux être sûre — c'est bien celui-ci ?",
    "Confirmez-vous que c'est votre appareil ?",
  ],
  shop_redirect: [
    "Je préfère que l'équipe vérifie directement votre matériel pour éviter de vous faire prendre un risque.",
    "Dans ce cas, le plus sûr est de passer en boutique avec votre appareil.",
  ],
  safety: [
    "N'utilisez plus l'appareil et ne le rechargez pas. Posez-le à l'écart de toute matière inflammable et apportez-le en boutique pour contrôle.",
  ],
};

export function pickPhrase(tone: ConversationTone, salt = 0): string {
  const list = PHRASE_BANK[tone];
  const idx = Math.abs(salt) % list.length;
  return list[idx];
}

/** Remplace / bloque les formulations robotiques. */
export function sanitizeRobotLanguage(text: string): string {
  let out = text;
  for (const re of FORBIDDEN_ROBOT_PHRASES) {
    if (re.test(out)) {
      out = out.replace(re, pickPhrase("ack", out.length));
    }
  }
  out = out
    .replace(/une erreur est survenue[^.!]*/gi, "Je rencontre un petit souci — on réessaie ensemble")
    .replace(/veuillez\s+/gi, "Pouvez-vous ")
    .replace(/merci de bien vouloir\s+/gi, "Pouvez-vous ");
  return out.trim();
}

/** Une seule question utile : tronque si plusieurs « ? ». */
export function enforceSingleQuestion(text: string): string {
  const parts = text.split(/(?<=[?])/);
  if (parts.length <= 2) return text.trim();
  // Garde le début + première question
  return `${parts[0]}${parts[1] || ""}`.trim();
}

export function humanSellerPolish(text: string, salt = 0): string {
  return enforceSingleQuestion(sanitizeRobotLanguage(text || pickPhrase("ack", salt)));
}
