/**
 * Voix Admin A.V.A. — collègue métier, pas chatbot / call-center.
 */

const CHATBOT_LINE =
  /^(je t['’]écoute|comment puis[- ]je|en quoi puis[- ]je|je suis (là|une? (ia|intelligence|assistante))|n['’]hésitez pas|je reste (à votre|disponible)|voici (ce que je peux|mes capacités)|dites[- ]moi (comment|en quoi)|avec plaisir\.?$|bien sûr[!.,]?\s*$|parfait[!.,]?\s*comment)/i;

const CHATBOT_INLINE = [
  /je t['’]écoute\.?\s*dis[- ]moi ce dont tu as besoin\.?/gi,
  /comment puis[- ]je vous aider( aujourd['’]hui)?\s*\??/gi,
  /en quoi puis[- ]je vous aider\s*\??/gi,
  /n['’]hésitez pas à (me )?demander\.?/gi,
  /je reste (à votre disposition|disponible)[^.!]*/gi,
  /en tant qu['’](assistante|intelligence artificielle)[^.!]*/gi,
  /je suis (une? )?(assistante virtuelle|ia|chatbot)[^.!]*/gi,
  /voici (une liste de )?(ce que je peux faire|mes capacités)[^.!]*/gi,
  /je comprends (parfaitement )?(votre|ta) demande[^.!]*/gi,
  /merci pour (votre|ta) (question|demande)[^.!]*/gi,
  /c['’]est une excellente question[^.!]*/gi,
];

/** Retire les formules chatbot ; ne laisse jamais une réponse vide. */
export function stripChatbotVoice(text: string, fallback: string): string {
  let out = (text || "").trim();
  for (const re of CHATBOT_INLINE) out = out.replace(re, " ");
  out = out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !CHATBOT_LINE.test(l))
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!out || CHATBOT_LINE.test(out) || out.length < 8) return fallback;
  return out;
}

export function looksLikeChatbot(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  if (CHATBOT_LINE.test(t)) return true;
  if (/comment puis[- ]je|je t['’]écoute|n['’]hésitez pas|à votre disposition/i.test(t)) {
    return true;
  }
  // Menu générique sans chiffre métier
  if (
    /stocks,\s*commandes|on commence où|que veux[- ]tu regarder/i.test(t) &&
    !/\d/.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Tour du magasin en prose collègue (pas rapport numéroté).
 */
export function colleagueTourFromToolText(raw: string, short: boolean): string {
  const text = (raw || "").trim();
  if (!text) return "J'ai regardé les chiffres — rien de net pour l'instant, ou les données traînent.";

  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const greeting = paragraphs[0] || "J'ai fait le tour.";
  const greetingKey = greeting.toLowerCase().slice(0, 60);

  const stopLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+\.\s*\[/.test(l));

  const points = stopLines.slice(0, short ? 2 : 3).map((l) => {
    const m = l.match(/^\d+\.\s*\[([^\]]+)\]\s*(.+)$/);
    if (!m) return l.replace(/^\d+\.\s*/, "");
    const urg = m[1];
    const title = m[2];
    if (urg === "urgent") return `Urgent : ${title}.`;
    if (urg === "watch") return `À surveiller : ${title}.`;
    return title.endsWith(".") ? title : `${title}.`;
  });

  // Autres paragraphes utiles (sans redire le greeting)
  const bodies = paragraphs
    .slice(1)
    .filter((l) => l.length > 20 && !/^idées/i.test(l) && !/^données manquantes/i.test(l))
    .filter((l) => !l.toLowerCase().startsWith(greetingKey.slice(0, 40)))
    .filter((l) => !/^avant autre chose/i.test(l) || !greetingKey.includes("avant autre chose"))
    .slice(0, short ? 2 : 4);

  const ideaLine = text.match(/Idées recommandées[\s\S]*?(?=Données|$)/i)?.[0];
  const firstIdea = ideaLine
    ?.split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("·"));

  const chunks: string[] = [greeting];
  if (points.length) chunks.push(points.join(" "));
  else if (bodies.length) chunks.push(bodies.slice(0, 2).join(" "));

  if (firstIdea && !short) {
    chunks.push(`Piste : ${firstIdea.replace(/^·\s*/, "")}`);
  } else if (firstIdea && short) {
    chunks.push(`Si tu veux, on creuse ça.`);
  }

  return stripChatbotVoice(chunks.join("\n\n"), greeting);
}

export const ADMIN_COLLEAGUE_SYSTEM_EXTRA = `
ANTI-CHATBOT (strict) :
- Tu n'es PAS un chatbot d'accueil. Tu es une collègue qui a déjà regardé le magasin.
- INTERDIT : « Comment puis-je vous aider », « Je t'écoute », « N'hésitez pas », « À votre disposition », menus de capacités, reformulations creuses.
- Commence par un FAIT ou une OBSERVATION (chiffre, anomalie, stock, idée), pas par une politesse vide.
- Si le message est un simple « bonjour » / « ça va » : réponds naturellement PUIS enchaîne avec 1–2 points métier utiles issus du contexte outils.
- Si tu n'as pas assez de données : dis-le franchement, propose UNE vérif précise — pas une liste de 8 options.
- Phrases humaines, tutoiement, opinion OK. Pas de « ### » ni de ton ticket support.`;
