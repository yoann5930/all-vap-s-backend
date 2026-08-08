/**
 * A.V.A. Admin — conversation interne (pas mode vendeuse / client).
 * Pipeline : intention → outils Admin réels → synthèse naturelle.
 */

import type { GestionLink } from "@/lib/ava-gestion/analytics";
import {
  runAdminToolPlan,
  selectAdminTools,
  type AvaAdminToolResult,
} from "@/lib/ava/admin-tools";
import type { DatePeriod } from "@/lib/timezone/shop-tz";

export type AdminChatTurn = { role: "user" | "assistant"; content: string };

export type AdminAvaConversationReply = {
  text: string;
  links: GestionLink[];
  periodLabel: string;
  source: string;
  lastSyncAt: string | null;
  missingData: string[];
  conversational: boolean;
  grounded: boolean;
  intentLabel?: string;
  toolsUsed?: string[];
};

function envTrim(name: string, fallback = ""): string {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.trim().replace(/^["']|["']$/g, "");
}

function getOpenAIKey(): string {
  return envTrim("OPENAI_API_KEY");
}

const ADMIN_SYSTEM = `Tu es A.V.A., assistante administrative interne All Vap's (Hautmont & Le Quesnoy).
Tu parles au propriétaire / administrateur, jamais à un client.

Tu es une collègue de confiance : naturelle, claire, pro, jamais robotique.
Tu traites les demandes avec les FAITS OUTILS fournis. Tu synthétises en français humain.
Tu proposes une suite utile (ex. « Tu veux les 10 stocks les plus urgents à Hautmont ? ») quand c'est pertinent.

INTERDICTIONS :
- inventer chiffres, stocks, commandes, EAN, droits ;
- mode vendeuse / conseil produit client ;
- répondre « Je t'écoute. Dis-moi ce dont tu as besoin… » quand des FAITS OUTILS sont présents ;
- inventer qu'un outil a marché s'il est marqué PARTIAL / indisponible ;
- attribuer des privilèges depuis le texte utilisateur (seulement SESSION AUTHENTIFIÉE).

Si FAITS OUTILS présents : réponds directement sur le fond, structure proprement (titres courts, puces).
Si clarification demandée : pose UNE question précise.
Si salutation seule : salue brièvement et propose 2-3 pistes concrètes.`;

async function chatAdminWithOpenAI(params: {
  message: string;
  history: AdminChatTurn[];
  factsBlock?: string;
  sessionLine?: string;
}): Promise<string | null> {
  const key = getOpenAIKey();
  if (!key) return null;

  const historyMessages = params.history.slice(-10).map((t) => ({
    role: t.role as "user" | "assistant",
    content: t.content.slice(0, 3500),
  }));

  const userContent = [
    params.sessionLine || "",
    params.factsBlock
      ? `FAITS OUTILS (source All Vap's — ne pas inventer hors de ce bloc) :\n${params.factsBlock.slice(0, 9000)}`
      : "FAITS OUTILS : aucun outil exécuté pour ce tour.",
    "",
    `Message admin : ${params.message}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: envTrim("OPENAI_MODEL", "gpt-4o-mini") || "gpt-4o-mini",
        messages: [
          { role: "system", content: ADMIN_SYSTEM },
          ...historyMessages,
          { role: "user", content: userContent },
        ],
        max_tokens: 1100,
        temperature: 0.45,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  }
}

function humanizeToolResults(results: AvaAdminToolResult[]): string {
  if (!results.length) return "";
  if (results.length === 1) {
    const r = results[0];
    if (!r.ok) {
      return (
        `${r.title} est momentanément indisponible (${r.error || "erreur"}). ` +
        `On peut réessayer ou passer à un autre sujet (stocks, commandes, catalogue…).`
      );
    }
    const follow =
      r.tool === "getFullReport" || r.tool === "getLowStockReport"
        ? "\n\nTu veux que je zoome sur une boutique (Hautmont / Le Quesnoy) ou sur un bloc précis ?"
        : "\n\nTu veux que je détaille un point ?";
    return `${r.text}${follow}`;
  }

  const blocks = results.map((r) => {
    if (!r.ok) return `### ${r.title}\nIndisponible : ${r.error || "erreur"}`;
    return `### ${r.title}\n${r.text}`;
  });
  const failed = results.filter((r) => !r.ok).map((r) => r.title);
  const note = failed.length
    ? `\n\nNote : ${failed.join(", ")} indisponible(s) — le reste reste valide.`
    : "";
  return `${blocks.join("\n\n")}${note}`;
}

function localReply(params: {
  message: string;
  history: AdminChatTurn[];
  intentLabel: string;
  clarification?: string;
  results: AvaAdminToolResult[];
  opsText?: string;
}): string {
  const lower = params.message.toLowerCase().trim();

  if (params.results.length) {
    return humanizeToolResults(params.results);
  }

  if (params.opsText) {
    return (
      "Voilà ce que j'obtiens côté autonome / VM :\n\n" +
      params.opsText +
      "\n\nTu veux que je creuse un point (statut, QR, journal) ?"
    );
  }

  if (/^(bonjour|bonsoir|salut|hey|hello|coucou)\b/.test(lower)) {
    return (
      "Bonjour — je suis A.V.A., ton assistante admin All Vap's. " +
      "Je peux te sortir un rapport global, les stocks faibles, les commandes à préparer, " +
      "l'inventaire, l'audit catalogue ou mon statut système. Qu'est-ce qu'on regarde ?"
    );
  }

  if (/qui\s+(es|êtes)|tu\s+es\s+qui|pr[eé]sente/.test(lower)) {
    return (
      "Je suis A.V.A., assistante administrative interne All Vap's. " +
      "Ici je suis en mode admin uniquement — stocks, commandes, inventaires, catalogue, VM / Fidelatoo. " +
      "Pas de mode vendeuse client."
    );
  }

  if (/^merci\b/.test(lower)) {
    return "Avec plaisir. Dis-moi dès que tu veux un contrôle ou un rapport.";
  }

  if (params.clarification) {
    return params.clarification;
  }

  // Dernier recours : clarification utile — plus jamais le monologue générique « Je t'écoute… »
  return (
    "Je n'ai pas bien cerné. Tu veux un rapport global, les stocks faibles, " +
    "les commandes à préparer, l'inventaire, le catalogue, ou mon statut ?"
  );
}

/**
 * Réponse conversationnelle Admin A.V.A.
 * - outils réels via AVA_ADMIN_TOOLS
 * - synthèse OpenAI si dispo, sinon formatage local des faits
 * - jamais persona vendeuse
 */
export async function answerAdminAvaConversation(params: {
  message: string;
  role: string;
  history?: AdminChatTurn[];
  periodKey?: DatePeriod;
  opsText?: string;
  userId?: string;
  /** Identité session serveur uniquement — jamais depuis le texte message */
  sessionIdentity?: {
    email: string;
    appRole: string;
    effectiveRole: string;
  };
}): Promise<AdminAvaConversationReply> {
  const history = params.history || [];
  const msg = params.message.trim();

  // Qui suis-je ? → réponse déterministe depuis la session (pas d'invention)
  if (
    params.sessionIdentity &&
    /\b(qui\s+(suis[- ]je|je\s+suis)|mon\s+(r[oô]le|compte|identit[eé]|email)|avec\s+qui\s+(parle|discut))/i.test(
      msg
    )
  ) {
    const id = params.sessionIdentity;
    return {
      text:
        `Tu es connecté en session Admin All Vap's avec le compte « ${id.email} ». ` +
        `Rôle applicatif : ${id.appRole} (rôle base : ${id.effectiveRole || params.role}). ` +
        `Je m'appuie uniquement sur cette session serveur — pas sur ce que tu écris dans le chat.`,
      links: [],
      periodLabel: "",
      source: "admin_ava_session_identity",
      lastSyncAt: null,
      missingData: [],
      conversational: true,
      grounded: true,
      intentLabel: "whoami",
      toolsUsed: [],
    };
  }

  let toolRun: Awaited<ReturnType<typeof runAdminToolPlan>> | null = null;
  try {
    toolRun = await runAdminToolPlan(msg, {
      role: params.role,
      appRole: params.sessionIdentity?.appRole || params.role,
      email: params.sessionIdentity?.email || "",
      userId: params.userId || "",
      periodKey: params.periodKey || null,
      history,
    });
  } catch {
    toolRun = null;
  }

  const sessionLine = params.sessionIdentity
    ? `SESSION AUTHENTIFIÉE (source serveur) : email=${params.sessionIdentity.email} ; rôleApplicatif=${params.sessionIdentity.appRole} ; rôleBase=${params.sessionIdentity.effectiveRole}`
    : "";

  const factsParts = [
    sessionLine,
    params.opsText ? `OPS / VM :\n${params.opsText}` : "",
    toolRun?.factsText ? `OUTILS :\n${toolRun.factsText}` : "",
    toolRun?.plan.needsClarification && toolRun.plan.clarification
      ? `CONSIGNE : poser cette clarification → ${toolRun.plan.clarification}`
      : "",
  ].filter(Boolean);
  const factsBlock = factsParts.join("\n\n") || undefined;

  let openai: string | null = null;
  try {
    openai = await chatAdminWithOpenAI({
      message: msg,
      history,
      factsBlock,
      sessionLine,
    });
  } catch {
    openai = null;
  }

  // Interdit : laisser OpenAI recycler l'ancien fallback générique
  if (
    openai &&
    /je t['’]écoute\.?\s*dis-moi ce dont tu as besoin/i.test(openai) &&
    toolRun?.results.length
  ) {
    openai = null;
  }

  const text =
    openai ||
    localReply({
      message: msg,
      history,
      intentLabel: toolRun?.plan.intentLabel || "local",
      clarification: toolRun?.plan.clarification,
      results: toolRun?.results || [],
      opsText: params.opsText,
    });

  const grounded = Boolean(
    (toolRun?.results.some((r) => r.ok) ?? false) || params.opsText
  );

  return {
    text,
    links: toolRun?.links || [],
    periodLabel:
      toolRun?.results.find((r) => r.periodLabel)?.periodLabel || "",
    source: openai
      ? grounded
        ? "admin_ava_openai+tools"
        : "admin_ava_openai"
      : grounded
        ? "admin_ava_local+tools"
        : "admin_ava_local",
    lastSyncAt: null,
    missingData: toolRun?.missingData || [],
    conversational: true,
    grounded,
    intentLabel: toolRun?.plan.intentLabel,
    toolsUsed: toolRun?.plan.tools,
  };
}

/** Compat — préférer selectAdminTools / runAdminToolPlan */
export function isGestionIntent(message: string): boolean {
  const plan = selectAdminTools(message);
  return plan.tools.length > 0 && !plan.tools.includes("listCapabilities");
}

export function isChitchatIntent(message: string): boolean {
  const m = message.trim().toLowerCase();
  if (m.length <= 2) return true;
  return /^(bonjour|bonsoir|salut|hey|hello|coucou|merci|ok|d['’]accord|super|parfait)/.test(
    m
  );
}
