import type {
  ActiveThread,
  SocialDetection,
  SocialIntentClass,
  SocialMove,
} from "./types";
import { isExplicitReplyInstruction } from "./explicit-reply";

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
    if (
      /stock|rupture|hautmont|quesnoy|vente|gamme|promo|prix|commande|anomal|banni|mise en avant|remise|%-|insatisf|twenty|simulation/i.test(
        c
      )
    ) {
      const banner = c.match(/banni[eè]re[^.!?\n]{0,40}|twenty[^.!?\n]{0,20}/i);
      if (banner) return banner[0].trim().slice(0, 80);
      const m = c.match(
        /(?:gamme|stock|ventes?|promo|prix|commande|anomal\w*|hautmont|quesnoy|banni[eè]re|mise en avant|remise|twenty)[^.!?\n]{0,70}/i
      );
      if (m) return m[0].trim().slice(0, 80);
      const first = c.split(/[.!?]/)[0]?.trim().slice(0, 80) || null;
      if (first && !/^ventes?\s*\/\s*insatisf/i.test(first)) return first;
      return m?.[0]?.trim().slice(0, 80) || "proposition commerciale";
    }
  }
  return null;
}

function has(hay: string, needles: string[]): boolean {
  return needles.some((n) => hay.includes(norm(n)));
}

function sanitizeSubject(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  if (/ventes?\s*\/\s*insatisf/i.test(t) || /possible frein/i.test(t)) {
    return "ruptures stock";
  }
  return t.slice(0, 80);
}

function promoSubjectFromMessage(message: string): string {
  const n = norm(message);
  if (/\b\d{1,2}\s*%/.test(n) || /-\s*\d+\s*%/.test(message)) {
    return message.trim().slice(0, 70);
  }
  if (/banniere|mise en avant/.test(n)) return "bannière / mise en avant";
  return "proposition commerciale";
}

function looksBusinessAsk(n: string): boolean {
  return (
    has(n, [
      "stock",
      "stocks",
      "vente",
      "ventes",
      "commande",
      "commandes",
      "catalogue",
      "anomal",
      "rapport",
      "tour",
      "chiffre",
      "inventaire",
      "hautmont",
      "quesnoy",
      "fidelatoo",
      "analyse",
      "bilan",
      "banniere",
      "simulation",
      "scenario",
      "mise en avant",
      "promo",
      "remise",
    ]) ||
    /^(et si)\b/.test(n) ||
    /-\s*\d+\s*%|\b\d{1,2}\s*%/.test(n) ||
    (/\bregarde\b/.test(n) &&
      has(n, ["stock", "vente", "commande", "chiffre", "ca", "rapport", "anomal"]))
  );
}

/**
 * Détecte le move social + résout le sujet implicite.
 * Règle d'or : SOCIAL_GREETING / SOCIAL_SMALLTALK → wantTools = false.
 */
export function detectSocialMove(
  message: string,
  history: { role: string; content: string }[] = [],
  activeThread: ActiveThread | null = null
): SocialDetection {
  const n = norm(message);
  const threadSubject =
    activeThread?.status === "open" || activeThread?.status === "deferred"
      ? sanitizeSubject(activeThread.subject)
      : null;
  const resolvedSubject =
    threadSubject || sanitizeSubject(lastAssistantWorkSubject(history));

  const base = (
    move: SocialMove,
    intentClass: SocialIntentClass,
    extra: Partial<SocialDetection> = {}
  ): SocialDetection => ({
    move,
    intentClass,
    resolvedSubject,
    preferLocalCompose: true,
    wantTools: false,
    preferShort: true,
    ...extra,
  });

  if (
    /^(es tu|etes vous|tu es|vous etes).*(humaine?|personne|vraie personne|humaine)/.test(n) ||
    has(n, ["tu es une ia", "t es une ia", "es tu une ia", "es tu une intelligence"])
  ) {
    return base("identity", "GENERAL_CONVERSATION", { wantTools: false });
  }

  // Consigne explicite de réponse simple — jamais d'outils / sujet métier hérité
  if (isExplicitReplyInstruction(message)) {
    return base("smalltalk", "GENERAL_CONVERSATION", {
      wantTools: false,
      preferLocalCompose: false,
      preferShort: true,
      resolvedSubject: null,
    });
  }

  // Sortie explicite du registre métier
  if (
    has(n, [
      "laisse tomber",
      "laisse tomber les ventes",
      "c est bon pour les stocks",
      "cest bon pour les stocks",
      "on laisse ca",
      "on laisse ça",
      "plus besoin",
      "arrete les ventes",
      "stop les ventes",
    ]) ||
    (/^(c est bon|cest bon|ok c est bon|parfait)\b/.test(n) &&
      has(n, ["stock", "vente", "commande", "ca"]))
  ) {
    return base("leave_work", "GENERAL_CONVERSATION", {
      wantTools: false,
      preferLocalCompose: true,
    });
  }

  // Salutations courtes — JAMAIS d'outils métier
  if (
    /^(cc|coucou|salut|bonjour|bonsoir|hey|hello|hi)(\s+(yoann|ava))?(\s*[!?]*)?$/.test(n) ||
    /^(salut ava|bonjour ava|hey ava|coucou yoann|salut yoann)(\s*[!?]*)?$/.test(n)
  ) {
    return base("greeting", "SOCIAL_GREETING", { wantTools: false });
  }

  // Check-in social
  if (
    /^(ca va|comment ca va|tu vas bien|ca roule|et toi|toi\s*\?)(\s*[!?]*)?$/.test(n) ||
    /^(oui tranquille|tranquille|oui et toi|oui ca va|ca va et toi)(\s*[!?]*)?$/.test(n) ||
    /^(sinon ca va|et sinon ca va)(\s*[!?]*)?$/.test(n)
  ) {
    return base("check_in", "SOCIAL_SMALLTALK", { wantTools: false });
  }

  // Smalltalk / conversation pure — outils OFF, mais LLM ON (pas de template figé)
  if (
    has(n, [
      "on parle un peu",
      "on discute",
      "je suis creve",
      "je suis fatigue",
      "bien dormi",
      "quoi de neuf",
      "quoi de beau",
      "tu bosses encore",
      "je regarde un peu le site",
      "je fais juste un tour",
    ]) ||
    (/^(quoi de neuf|quoi de beau)[!?.]*$/.test(n) && !looksBusinessAsk(n.replace(/quoi de (neuf|beau)/, "")))
  ) {
    // « quoi de neuf » seul = social ; « quoi de neuf côté ventes » = métier
    if (/quoi de (neuf|beau).*(vente|stock|commande|chiffre|boutique)/.test(n)) {
      return base("work", "BUSINESS_QUESTION", {
        preferLocalCompose: false,
        wantTools: true,
        preferShort: false,
      });
    }
    return base("smalltalk", "SOCIAL_SMALLTALK", {
      wantTools: false,
      preferLocalCompose: false,
    });
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
    ])
  ) {
    return base("ask_opinion", "FOLLOW_UP", {
      wantTools: !resolvedSubject,
      preferShort: true,
    });
  }

  if (
    has(n, [
      "on verra demain",
      "on verra ca demain",
      "on garde ca pour demain",
      "pas maintenant",
      "plus tard",
    ]) ||
    (/^demain[!?.]*$/.test(n) && n.length < 20)
  ) {
    const deferSubject =
      sanitizeSubject(activeThread?.subject) ||
      sanitizeSubject(lastAssistantWorkSubject(history)) ||
      resolvedSubject;
    return base("defer", "FOLLOW_UP", {
      wantTools: false,
      resolvedSubject: deferSubject,
    });
  }

  if (
    has(n, ["on reprend", "on reprend ca", "on reprend ?", "reprends", "reprendre", "on reprend ce qu on disait"]) ||
    /^(on continue)\b/.test(n)
  ) {
    return base("resume", "FOLLOW_UP", {
      resolvedSubject:
        activeThread?.status === "deferred"
          ? sanitizeSubject(activeThread.subject)
          : resolvedSubject,
      wantTools: Boolean(
        (activeThread?.status === "deferred" ? activeThread.subject : resolvedSubject) &&
          looksBusinessAsk(
            norm(
              (activeThread?.status === "deferred" ? activeThread.subject : resolvedSubject) ||
                ""
            )
          )
      ),
      preferShort: true,
    });
  }

  if (
    has(n, ["je prefere", "faisons", "on fait", "brade", "promo", "remise"]) &&
    (has(n, ["promo", "prix", "remise", "brade", "%"]) || /\b\d{1,2}\s*%/.test(n))
  ) {
    return base("disagree_prompt", "BUSINESS_ACTION", {
      resolvedSubject: promoSubjectFromMessage(message) || "proposition commerciale",
      wantTools: true,
      preferShort: false,
    });
  }

  if (/^(merci|thanks|nickel|super|parfait|ok|d accord)[!?.]*$/.test(n)) {
    return base("thanks", "GENERAL_CONVERSATION", { wantTools: false });
  }

  if (
    /^(ah oui|vas y|continue|dis moi|et alors|ok et)(\s*[!?]*)?$/.test(n)
  ) {
    return base("light_ack", "FOLLOW_UP", {
      wantTools: Boolean(resolvedSubject && looksBusinessAsk(norm(resolvedSubject))),
      preferLocalCompose: false,
    });
  }

  // Relance courte après un sujet métier (« pourquoi ? », « et Hautmont ? »)
  if (
    /^(pourquoi|et alors|comment)(\s*[!?]*)?$/.test(n) ||
    (/^(et)\b/.test(n) && n.length < 40)
  ) {
    const biz = Boolean(resolvedSubject && looksBusinessAsk(norm(resolvedSubject)));
    return base(biz ? "work" : "smalltalk", biz ? "FOLLOW_UP" : "GENERAL_CONVERSATION", {
      wantTools: biz,
      preferLocalCompose: false,
      preferShort: true,
      resolvedSubject,
    });
  }

  if (
    has(n, [
      "je suis pas d accord",
      "je ne suis pas d accord",
      "pas d accord",
      "non je suis pas d accord",
    ]) ||
    /^non\b.*(d accord|daccord)/.test(n)
  ) {
    return base("disagree_prompt", "FOLLOW_UP", {
      resolvedSubject: resolvedSubject || "proposition en cours",
      wantTools: false,
      preferShort: true,
      preferLocalCompose: true,
    });
  }

  if (/propose autre chose|autre piste|autre idee|autre id[eé]e/.test(n)) {
    return base("ask_opinion", "FOLLOW_UP", {
      resolvedSubject: resolvedSubject || "alternative",
      wantTools: false,
      preferShort: true,
      preferLocalCompose: true,
    });
  }

  // Demande métier explicite
  if (looksBusinessAsk(n)) {
    const fromMsg =
      sanitizeSubject(
        message.match(
          /(?:stock|vente|commande|hautmont|quesnoy|catalogue|anomal|promo|banni[eè]re|twenty)[^.!?\n]{0,50}/i
        )?.[0] || null
      ) || resolvedSubject;
    return base("work", "BUSINESS_QUESTION", {
      preferLocalCompose: false,
      wantTools: true,
      preferShort: n.length < 55,
      resolvedSubject: fromMsg,
    });
  }

  // Court message non classé → conversation générale via LLM (pas de template « Je te suis »)
  if (n.length < 40 && !looksBusinessAsk(n)) {
    return base("smalltalk", "GENERAL_CONVERSATION", {
      wantTools: false,
      preferLocalCompose: false,
    });
  }

  return base("work", "BUSINESS_QUESTION", {
    preferLocalCompose: false,
    wantTools: true,
    preferShort: n.length < 55,
  });
}

/** Moves qui restent en compose local déterministe (salut / check-in / identité…). */
export function shouldPreferLocalCompose(
  move: SocialMove,
  preferLocalCompose: boolean
): boolean {
  if (!preferLocalCompose) return false;
  return (
    move === "greeting" ||
    move === "check_in" ||
    move === "thanks" ||
    move === "identity" ||
    move === "leave_work" ||
    move === "defer" ||
    move === "resume" ||
    move === "ask_opinion" ||
    move === "disagree_prompt"
  );
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

/** True si le move ne doit jamais déclencher d'outils métier. */
export function isPureSocialMove(m: SocialMove): boolean {
  return (
    m === "greeting" ||
    m === "check_in" ||
    m === "smalltalk" ||
    m === "thanks" ||
    m === "identity" ||
    m === "leave_work" ||
    m === "defer"
  );
}
