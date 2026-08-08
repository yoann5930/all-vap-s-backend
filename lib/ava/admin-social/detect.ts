import type { ActiveThread, SocialDetection, SocialMove } from "./types";

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

function lastAssistantWorkSubject(
  history: { role: string; content: string }[]
): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const t = history[i];
    if (t.role !== "assistant") continue;
    const c = t.content;
    if (/stock|rupture|hautmont|quesnoy|vente|gamme|promo|prix|commande|anomal/i.test(c)) {
      const m = c.match(
        /(?:gamme|stock|ventes?|promo|prix|commande|anomal\w*|hautmont|quesnoy)[^.!?\n]{0,60}/i
      );
      if (m) return m[0].trim().slice(0, 80);
      return c.split(/[.!?]/)[0]?.trim().slice(0, 80) || null;
    }
  }
  return null;
}

/**
 * Détecte le move social + résout le sujet implicite.
 */
export function detectSocialMove(
  message: string,
  history: { role: string; content: string }[] = [],
  activeThread: ActiveThread | null = null
): SocialDetection {
  const n = norm(message);
  const resolvedSubject =
    activeThread?.status === "open" || activeThread?.status === "deferred"
      ? activeThread.subject
      : lastAssistantWorkSubject(history);

  if (
    /^(es tu|etes vous|tu es|vous etes).*(humaine?|personne|vraie personne|humaine)/.test(n) ||
    has(n, ["tu es une ia", "t es une ia", "es tu une ia", "es tu une intelligence"])
  ) {
    return {
      move: "identity",
      resolvedSubject,
      preferLocalCompose: true,
      wantTools: false,
      preferShort: true,
    };
  }

  if (/^(bonjour|bonsoir|salut|hey|hello|coucou)( yoann| ava)?[!?.]*$/.test(n)) {
    return {
      move: "greeting",
      resolvedSubject,
      preferLocalCompose: true,
      wantTools: true,
      preferShort: true,
    };
  }

  if (
    /^(ca va|comment ca va|tu vas bien|ca roule)[!?.]*$/.test(n) ||
    /^(ca va\s*\??|comment ca va\s*\??)$/.test(n)
  ) {
    return {
      move: "check_in",
      resolvedSubject,
      preferLocalCompose: true,
      wantTools: true,
      preferShort: true,
    };
  }

  if (
    has(n, [
      "tu en penses quoi",
      "t en penses quoi",
      "ton avis",
      "tu penses quoi",
      "t es d accord",
      "tu es d accord",
      "ca te dit",
      "tu ferais quoi",
    ]) ||
    /^(et toi|toi\s*\?)\s*$/.test(n)
  ) {
    return {
      move: "ask_opinion",
      resolvedSubject,
      preferLocalCompose: true,
      wantTools: !resolvedSubject, // si pas de sujet → outils légers ; sinon avis sur fil
      preferShort: true,
    };
  }

  if (
    has(n, [
      "on verra demain",
      "on verra ca demain",
      "on garde ca pour demain",
      "pas maintenant",
      "plus tard",
      "demain",
    ]) &&
    n.length < 80
  ) {
    return {
      move: "defer",
      resolvedSubject,
      preferLocalCompose: true,
      wantTools: false,
      preferShort: true,
    };
  }

  if (
    has(n, ["on reprend", "on reprend ca", "on reprend ?", "reprends", "reprendre"]) ||
    /^(on continue|continue)\b/.test(n)
  ) {
    return {
      move: "resume",
      resolvedSubject:
        activeThread?.status === "deferred"
          ? activeThread.subject
          : resolvedSubject,
      preferLocalCompose: true,
      wantTools: true,
      preferShort: true,
    };
  }

  if (
    has(n, ["je prefere", "faisons", "on fait", "brade", "promo", "remise"]) &&
    (has(n, ["promo", "prix", "remise", "brade", "%"]) || /\b\d{1,2}\s*%/.test(n))
  ) {
    return {
      move: "disagree_prompt",
      resolvedSubject: resolvedSubject || "proposition commerciale",
      preferLocalCompose: true,
      wantTools: true,
      preferShort: false,
    };
  }

  if (/^(merci|thanks|nickel|super|parfait|ok|d accord)[!?.]*$/.test(n)) {
    return {
      move: "thanks",
      resolvedSubject,
      preferLocalCompose: true,
      wantTools: false,
      preferShort: true,
    };
  }

  if (/^(ah oui|vas y|continue|dis moi|et alors|ok et)[!?.]*$/.test(n)) {
    return {
      move: "light_ack",
      resolvedSubject,
      preferLocalCompose: true,
      wantTools: Boolean(resolvedSubject),
      preferShort: true,
    };
  }

  return {
    move: "work",
    resolvedSubject,
    preferLocalCompose: false,
    wantTools: true,
    preferShort: n.length < 55,
  };
}

function has(hay: string, needles: string[]): boolean {
  return needles.some((n) => hay.includes(norm(n)));
}

export function firstNameFromEmail(email?: string | null): string | null {
  if (!email) return null;
  const e = email.toLowerCase();
  if (e.includes("yoann")) return "Yoann";
  const local = e.split("@")[0] || "";
  const part = local.split(/[._-]/)[0];
  if (!part || part.length < 2) return null;
  return part.charAt(0).toUpperCase() + part.slice(1);
}

export function isSocialMove(m: SocialMove): boolean {
  return m !== "work";
}
