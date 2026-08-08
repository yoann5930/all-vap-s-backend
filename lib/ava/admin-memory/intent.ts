import type { AdminIntentAnalysis, AdminConversationalIntent } from "./types";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’ʼ]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(hay: string, needles: string[]): boolean {
  return needles.some((n) => hay.includes(norm(n)));
}

/**
 * Intention conversationnelle Admin — oriente longueur + outils + mémoire.
 */
export function analyzeAdminIntent(
  message: string,
  history: { role: string; content: string }[] = []
): AdminIntentAnalysis {
  const n = norm(message);
  const short = n.length < 55;

  if (/^(bonjour|bonsoir|salut|hey|hello|coucou)( ava)?[!?.]*$/.test(n)) {
    return {
      intent: "greeting",
      preferShort: true,
      isFollowUp: false,
      isCorrection: false,
      isResume: false,
      isPause: false,
      topicHint: null,
    };
  }
  if (/^(merci|thanks|nickel|super|parfait|ok|d accord)[!?.]*$/.test(n)) {
    return {
      intent: "thanks",
      preferShort: true,
      isFollowUp: false,
      isCorrection: false,
      isResume: false,
      isPause: false,
      topicHint: null,
    };
  }
  if (hasAny(n, ["qui suis je", "mon role", "mon compte", "mon identite"])) {
    return {
      intent: "whoami",
      preferShort: true,
      isFollowUp: false,
      isCorrection: false,
      isResume: false,
      isPause: false,
      topicHint: "session",
    };
  }

  const isCorrection =
    hasAny(n, [
      "en fait",
      "c est faux",
      "ce n est pas",
      "non ",
      "correction",
      "plutot",
      "je corrige",
      "tu te trompes",
      "est bien",
      "est deja",
    ]) && n.length < 220;

  const isPause =
    hasAny(n, [
      "en pause",
      "mettre en pause",
      "mets en pause",
      "met en pause",
      "mis en pause",
      "on reprend demain",
      "on verra demain",
      "on verra ca demain",
      "on garde ca pour demain",
    ]) || /\bmet(?:s|tre)?\b.*\bpause\b/.test(n);

  const isResume =
    (hasAny(n, ["on reprend", "reprends", "reprendre", "on continue"]) ||
      /^(continue)\b/.test(n)) &&
    !hasAny(n, ["continuite"]);

  const isFollowUp =
    /^(et|donc|ensuite|aussi|pareil|idem|uniquement|seulement|juste)\b/.test(n) ||
    (history.length > 0 &&
      short &&
      /^(et|donc|ensuite|uniquement|seulement)\b/.test(n));

  let intent: AdminConversationalIntent = "unclear";
  let preferShort = false;
  let topicHint: string | null = null;

  if (isCorrection) intent = "correction";
  else if (isPause || isResume) intent = "continuation";
  else if (isFollowUp) {
    intent = "followup";
    preferShort = true;
  } else if (hasAny(n, ["explique", "pourquoi", "diagnostic detaille", "analyse complete"])) {
    intent = "explanation";
    preferShort = false;
  } else if (hasAny(n, ["diagnost", "ne demarre pas", "ne marche pas", "erreur", "panne"])) {
    intent = "diagnostic";
    preferShort = false;
  } else if (hasAny(n, ["compare", "versus", "difference", "ecart"])) {
    intent = "comparison";
    preferShort = false;
  } else if (
    (hasAny(n, ["est ce que", "est-ce que"]) ||
      /^(la |le |l |elle |il )?(vm|fidelatoo|stock|session)/.test(n) ||
      hasAny(n, ["tourne", "demarree", "en ligne", "statut", "etat de", "etat de la"])) &&
    short
  ) {
    intent = "status_check";
    preferShort = true;
  } else if (
    hasAny(n, ["lance", "demarre", "arrete", "execute", "fais ", "ouvre ", "recupere mon qr"])
  ) {
    intent = "action";
    preferShort = true;
  } else if (hasAny(n, ["rapport", "rapports", "resume", "tous les"])) {
    intent = "report";
    preferShort = false;
  } else if (hasAny(n, ["oui", "non", "confirme", "d accord", "vas y"])) {
    intent = "confirmation";
    preferShort = true;
  } else if (short) {
    intent = "status_check";
    preferShort = true;
  } else {
    intent = "explanation";
    preferShort = false;
  }

  if (hasAny(n, ["vm", "machine virtuelle"])) topicHint = "vm";
  else if (hasAny(n, ["fidelatoo"])) topicHint = "fidelatoo";
  else if (hasAny(n, ["stock", "stocks"])) topicHint = "stocks";
  else if (hasAny(n, ["commande", "commandes"])) topicHint = "commandes";
  else if (hasAny(n, ["inventaire"])) topicHint = "inventaire";
  else if (hasAny(n, ["catalogue", "gamme"])) topicHint = "catalogue";
  else if (hasAny(n, ["migration"])) topicHint = "migration";

  return {
    intent,
    preferShort,
    isFollowUp,
    isCorrection,
    isResume,
    isPause,
    topicHint,
  };
}
