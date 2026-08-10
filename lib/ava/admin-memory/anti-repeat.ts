/**
 * Empreinte simple + détection de réponses trop similaires.
 */

const BANNED_GENERIC =
  /je te suis\.?|dis[- ]moi ce qui te pr[eé]occupe|qu['’]est[- ]ce qui te pr[eé]occupe|en quoi puis[- ]je t['’]?aider|comment puis[- ]je (vous |t['’])?aider|je t['’]écoute\.?|je reste à (ta|votre) disposition|c['’]est une excellente question/i;

function fingerprint(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9àâäéèêëïîôùûüç\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function tokens(s: string): Set<string> {
  return new Set(
    fingerprint(s)
      .split(" ")
      .filter((t) => t.length > 3)
  );
}

export function replySimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size);
}

export function isTooSimilarToRecent(
  candidate: string,
  recentFingerprintsOrTexts: string[],
  threshold = 0.62
): boolean {
  const c = candidate.trim();
  if (!c) return false;
  if (BANNED_GENERIC.test(c) && c.length < 160) return true;
  for (const prev of recentFingerprintsOrTexts) {
    if (replySimilarity(c, prev) >= threshold) return true;
    // Même amorce répétée (« Je te suis », « OK. Dis-moi… »)
    const a = fingerprint(c).slice(0, 48);
    const b = fingerprint(prev).slice(0, 48);
    if (a.length > 20 && b.length > 20 && (a === b || a.includes(b) || b.includes(a))) {
      return true;
    }
  }
  return false;
}

export function makeReplyFingerprint(text: string): string {
  return fingerprint(text);
}

export function looksLikeBannedGeneric(text: string): boolean {
  return BANNED_GENERIC.test(text || "");
}

/**
 * Si trop similaire : forcer une version plus courte / directe.
 */
export function dampenRepetition(text: string, preferShort: boolean): string {
  let raw = (text || "")
    .replace(/je te suis\.?/gi, "")
    .replace(/dis[- ]moi ce qui te pr[eé]occupe[^.!?]*/gi, "")
    .replace(/je comprends (votre|ta) demande[^.!?]*/gi, "")
    .replace(/votre demande concernant[^.!?]*/gi, "")
    .replace(/voici les différentes étapes[^.!?]*/gi, "")
    .replace(/je t['’]écoute[^.!?]*/gi, "")
    .replace(/comment puis[- ]je (vous |t['’])?aider( aujourd['’]hui)?\s*\??/gi, "")
    .replace(/en quoi puis[- ]je[^.!?]*/gi, "")
    .replace(/n['’]hésitez pas[^.!?]*/gi, "")
    .replace(/je reste à (votre|ta) disposition[^.!?]*/gi, "")
    .replace(/c['’]est une excellente question[^.!?]*/gi, "")
    .replace(/merci pour (votre|ta) (question|demande)[^.!?]*/gi, "")
    .replace(/tu veux qu['’]on reste en mode discussion[^.!?]*/gi, "");

  const cleaned = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (preferShort) {
    return cleaned.slice(0, 6).join("\n").slice(0, 700);
  }
  return cleaned.join("\n").slice(0, 2500);
}

/**
 * Reformule minimale ancrée sur le dernier message user quand on détecte une boucle.
 */
export function forceGroundedReply(params: {
  userMessage: string;
  recentAssistant: string[];
  ownerFirstName?: string | null;
  threadSubject?: string | null;
}): string {
  const msg = params.userMessage.replace(/\s+/g, " ").trim().slice(0, 120);
  const name = params.ownerFirstName;
  const sub = params.threadSubject && params.threadSubject !== "discussion"
    ? params.threadSubject
    : null;
  const recent = params.recentAssistant.map((t) => fingerprint(t)).join(" ");

  const candidates = [
    msg.length > 6
      ? `Sur ton message (« ${msg} ») : je te réponds concrètement — tu veux mon avis, une vérif données, ou juste en parler ?`
      : null,
    sub
      ? `Je ne te ressert pas la même phrase. Sur « ${sub} », où tu veux qu'on avance exactement ?`
      : null,
    name
      ? `${name}, j'ai bien ton dernier message. Reformule en une phrase ce que tu attends de moi là, et j'y vais.`
      : "J'ai bien ton dernier message. Dis-moi en une phrase ce que tu attends de moi, et j'y vais.",
    "Je change d'angle : qu'est-ce que tu veux que je fasse maintenant, concrètement ?",
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (!isTooSimilarToRecent(c, params.recentAssistant, 0.55) && !recent.includes(fingerprint(c).slice(0, 30))) {
      return c;
    }
  }
  return candidates[candidates.length - 1] || "OK — dis-moi précisément quoi faire.";
}
