/**
 * A.V.A. Admin — conversation interne (pas mode vendeuse / client).
 * Pipeline : intention → mémoire sélective → outils → réponse naturelle → MAJ mémoire.
 */

import type { GestionLink } from "@/lib/ava-gestion/analytics";
import {
  runAdminToolPlan,
  selectAdminTools,
  type AvaAdminToolResult,
} from "@/lib/ava/admin-tools";
import {
  analyzeAdminIntent,
  compactHistoryForLlm,
  dampenRepetition,
  isTooSimilarToRecent,
  loadAdminPersistentMemory,
  loadAdminSessionMemory,
  retrieveRelevantAdminMemory,
  updateAdminMemoryAfterTurn,
  type AdminIntentAnalysis,
} from "@/lib/ava/admin-memory";
import type { DatePeriod } from "@/lib/timezone/shop-tz";
import {
  ADMIN_COLLEAGUE_SYSTEM_EXTRA,
  colleagueTourFromToolText,
  looksLikeChatbot,
  stripChatbotVoice,
} from "@/lib/ava/admin-voice";
import { stripTechnicalLeak } from "@/lib/ava/admin-tools/sanitize-error";
import {
  buildStance,
  composeSocialReply,
  detectSocialMove,
  firstNameFromEmail,
  nextThreadAfterTurn,
  type ActiveThread,
} from "@/lib/ava/admin-social";

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
  conversationalIntent?: string;
};

function envTrim(name: string, fallback = ""): string {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.trim().replace(/^["']|["']$/g, "");
}

function getOpenAIKey(): string {
  return envTrim("OPENAI_API_KEY");
}

const ADMIN_SYSTEM = `Tu es A.V.A., collaboratrice numérique senior All Vap's (Hautmont & Le Quesnoy) — mode Admin uniquement, jamais vendeuse client.

STYLE :
- collègue qui travaille déjà, pas chatbot d'accueil ;
- naturel, direct, tutoiement ; phrases courtes si question simple ;
- continue la conversation ; références (« ça », « pourquoi », « l'autre boutique », « on reprend ») via MÉMOIRE ;
- tu peux avoir un avis argumenté et ne pas être d'accord ; si une donnée contredit ton idée, tu changes d'avis clairement ;
- pas de chaîne de pensée privée : structure métier (observation / hypothèse / idée / risque / confiance) quand c'est utile ;
- si le contexte outils contient un tour / anomalies / idées : réutilise-les en prose humaine, ne redis pas un menu.

RÈGLES :
- n'invente jamais chiffres, stocks, droits, états ;
- distingue : mémoire vs outils vérifiés vs observation marché web vs inconnu ;
- corrélation ≠ causalité ; données insuffisantes → le dire ;
- ne propose pas systématiquement une remise ; préfère tests mesurables (visibilité, contenu, animation) quand pertinent ;
- actions sensibles (prix, promos, commandes fournisseurs, suppression, DNS, déploiement, paiements) : proposer/préparer seulement → validation humaine ;
- jamais de fuite de données Admin vers un contexte client.

${ADMIN_COLLEAGUE_SYSTEM_EXTRA}

INTENTION COURANTE indique réponse courte ou détaillée.`;

async function chatAdminWithOpenAI(params: {
  message: string;
  history: AdminChatTurn[];
  factsBlock?: string;
  sessionLine?: string;
  intent: AdminIntentAnalysis;
  preferShort: boolean;
}): Promise<string | null> {
  const key = getOpenAIKey();
  if (!key) return null;

  const historyMessages = compactHistoryForLlm(params.history, params.preferShort).map(
    (t) => ({
      role: t.role as "user" | "assistant",
      content: t.content,
    })
  );

  const userContent = [
    params.sessionLine || "",
    `INTENTION : ${params.intent.intent} ; réponse ${params.preferShort ? "COURTE" : "DÉTAILLÉE"} ; followup=${params.intent.isFollowUp}`,
    params.factsBlock
      ? `CONTEXTE UTILE :\n${params.factsBlock.slice(0, 7000)}`
      : "CONTEXTE UTILE : (vide)",
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
        max_tokens: params.preferShort ? 320 : 900,
        temperature: params.preferShort ? 0.35 : 0.45,
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

/** Synthèse courte à partir d'un dump outil (questions d'état). */
function shortFromTool(results: AvaAdminToolResult[], topicHint: string | null): string {
  const ok = results.filter((r) => r.ok);
  if (!ok.length) {
    const fail = results[0];
    return fail
      ? `Je n'ai pas pu vérifier proprement (${fail.error || "indisponible"}). On réessaie dans une minute ?`
      : "Je n'ai pas encore l'info — je peux aller la chercher.";
  }

  const tour = ok.find((r) => r.tool === "runDailyTour");
  if (tour) return colleagueTourFromToolText(tour.text, true);

  const text = ok.map((r) => r.text).join("\n");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^rapport|^résumé|^audit|^inventaires/i.test(l));

  if (topicHint === "vm" || /vm\s*:/i.test(text)) {
    const vm = text.match(/VM\s*[:=]\s*([^\n·]+)/i)?.[1]?.trim();
    const app = text.match(/App\s*[:=]\s*([^\n·]+)/i)?.[1]?.trim();
    if (vm) {
      return `Oui — côté VM : ${vm}${app ? ` · app ${app}` : ""}.`.slice(0, 280);
    }
  }
  if (topicHint === "fidelatoo" || /fidelatoo|orchestrateur/i.test(text)) {
    const reach = /joignable\s*:\s*oui/i.test(text);
    const conf = /configuré\s*:\s*oui/i.test(text);
    return `Fidelatoo : orchestrateur ${conf ? "configuré" : "non configuré"}, ${reach ? "joignable" : "injoignable"}.`.slice(
      0,
      280
    );
  }

  const pick = lines.filter((l) => /:|\d|oui|non|ok|actif|stop/i.test(l)).slice(0, 4);
  if (pick.length) return pick.join(" · ").slice(0, 420);
  return lines.slice(0, 3).join(" ").slice(0, 420);
}

function humanizeToolResults(
  results: AvaAdminToolResult[],
  preferShort: boolean,
  topicHint: string | null
): string {
  if (!results.length) return "";

  const tour = results.find((r) => r.ok && r.tool === "runDailyTour");
  if (tour && (preferShort || results.length === 1)) {
    return colleagueTourFromToolText(tour.text, preferShort);
  }

  if (preferShort) return shortFromTool(results, topicHint);

  if (results.length === 1) {
    const r = results[0];
    if (!r.ok) {
      return `${r.title} est momentanément indisponible (${r.error || "erreur"}). On change de sujet ou on réessaie ?`;
    }
    if (r.tool === "runDailyTour") return colleagueTourFromToolText(r.text, false);
    return r.text;
  }

  const blocks = results.map((r) => {
    if (!r.ok) return `${r.title} — indisponible (${r.error || "erreur"})`;
    if (r.tool === "runDailyTour") return colleagueTourFromToolText(r.text, false);
    return `${r.title}\n${r.text}`;
  });
  const failed = results.filter((r) => !r.ok).map((r) => r.title);
  const note = failed.length
    ? `\n\n${failed.join(", ")} indisponible(s) — le reste tient.`
    : "";
  return `${blocks.join("\n\n")}${note}`;
}

function localReply(params: {
  message: string;
  intent: AdminIntentAnalysis;
  clarification?: string;
  results: AvaAdminToolResult[];
  opsText?: string;
  memoryHint?: string;
}): string {
  const lower = params.message.toLowerCase().trim();

  if (params.results.length) {
    return humanizeToolResults(
      params.results,
      params.intent.preferShort,
      params.intent.topicHint
    );
  }

  if (params.opsText) {
    if (params.intent.preferShort) {
      return params.opsText.split("\n").filter(Boolean).slice(0, 4).join(" · ").slice(0, 400);
    }
    return `Côté autonome / VM :\n\n${params.opsText}`;
  }

  if (params.intent.isResume && params.memoryHint) {
    return `On reprend. ${params.memoryHint.slice(0, 420)}\nJe continue sur ce point ?`;
  }

  if (/^(cc|bonjour|bonsoir|salut|hey|hello|coucou|hi)\b/.test(lower)) {
    return "Salut. Ça va ?";
  }
  if (/^(ça va|ca va|comment ça va|comment ca va)\b/.test(lower)) {
    return "Ça va. Et de ton côté ?";
  }
  if (/qui\s+(es|êtes)|tu\s+es\s+qui|pr[eé]sente/.test(lower)) {
    return "A.V.A. — collègue métier All Vap's, mode interne. Pas vendeuse client.";
  }

  if (/^merci\b/.test(lower)) return "OK.";

  if (params.clarification) return params.clarification;

  return "J'ai pas accroché. Tu veux qu'on discute, ou que je regarde un point concret (stock, commande, chiffre) ?";
}
/**
 * Réponse conversationnelle Admin A.V.A.
 */
export async function answerAdminAvaConversation(params: {
  message: string;
  role: string;
  history?: AdminChatTurn[];
  periodKey?: DatePeriod;
  opsText?: string;
  userId?: string;
  conversationId?: string | null;
  sessionIdentity?: {
    email: string;
    appRole: string;
    effectiveRole: string;
  };
}): Promise<AdminAvaConversationReply> {
  const history = params.history || [];
  const msg = params.message.trim();
  const intent = analyzeAdminIntent(msg, history);

  // Qui suis-je ? → session serveur
  if (
    params.sessionIdentity &&
    (intent.intent === "whoami" ||
      /\b(qui\s+(suis[- ]je|je\s+suis)|mon\s+(r[oô]le|compte|identit[eé]|email))\b/i.test(msg))
  ) {
    const id = params.sessionIdentity;
    return {
      text:
        `Tu es connecté en session Admin avec « ${id.email} » — rôle ${id.appRole} (base ${id.effectiveRole || params.role}). ` +
        `Je m'appuie sur la session serveur, pas sur le texte du chat.`,
      links: [],
      periodLabel: "",
      source: "admin_ava_session_identity",
      lastSyncAt: null,
      missingData: [],
      conversational: true,
      grounded: true,
      intentLabel: "whoami",
      conversationalIntent: "whoami",
      toolsUsed: [],
    };
  }

  // Mémoire persistante + session (Admin only — jamais côté client)
  let memoryBlock = "";
  let sessionFingerprints: string[] = [];
  let activeThread: ActiveThread | null = null;
  if (params.userId) {
    try {
      const persistent = await loadAdminPersistentMemory(params.userId);
      const session = params.conversationId
        ? await loadAdminSessionMemory(params.userId, params.conversationId)
        : null;
      sessionFingerprints = session?.recentReplyFingerprints || [];
      activeThread = (session?.activeThread as ActiveThread | null) || null;
      const retrieved = retrieveRelevantAdminMemory({
        persistent,
        session,
        message: msg,
        topicHint: intent.topicHint || activeThread?.subject || null,
      });
      memoryBlock = retrieved.factsBlock;
    } catch {
      /* optional */
    }
  }

  const social = detectSocialMove(msg, history, activeThread);
  const ownerFirstName = firstNameFromEmail(params.sessionIdentity?.email);

  let toolRun: Awaited<ReturnType<typeof runAdminToolPlan>> | null = null;
  const skipTools =
    social.wantTools === false ||
    social.move === "greeting" ||
    social.move === "check_in" ||
    social.move === "smalltalk" ||
    social.move === "leave_work" ||
    social.move === "defer" ||
    social.move === "thanks" ||
    social.move === "identity" ||
    (intent.intent === "correction" && !intent.topicHint) ||
    (social.move === "ask_opinion" && Boolean(social.resolvedSubject) && !social.wantTools);

  if (!skipTools && social.wantTools) {
    try {
      // Reprise légère : tour seulement si le message le demande vraiment
      const toolMessage =
        social.move === "resume" || social.move === "light_ack"
          ? /stock|commande|rapport|anomal|vm|fidelatoo|catalogue|vente|tour/i.test(msg)
            ? msg
            : social.resolvedSubject
              ? `point sur ${social.resolvedSubject}`
              : msg
          : msg;

      toolRun = await runAdminToolPlan(toolMessage, {
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
  }

  // En social pur : ignorer tout signal d'échec outil (ne doit pas polluer la discussion)
  const rawWorkSignal = toolRun?.results.length
    ? humanizeToolResults(toolRun.results, true, intent.topicHint || social.resolvedSubject)
    : params.opsText
      ? params.opsText.split("\n").filter(Boolean).slice(0, 3).join(" ")
      : null;
  const workSignal =
    social.wantTools === false ||
    social.move === "greeting" ||
    social.move === "check_in" ||
    social.move === "smalltalk" ||
    social.move === "leave_work"
      ? null
      : rawWorkSignal &&
          !/indisponible|pas pu v[eé]rifier|donn[eé]es m[eé]tier|prisma|timeout/i.test(rawWorkSignal)
        ? rawWorkSignal
        : social.wantTools
          ? rawWorkSignal
          : null;

  const stance =
    social.move === "ask_opinion" || social.move === "disagree_prompt"
      ? buildStance({
          subject: social.resolvedSubject,
          workSignal,
          userProposal: social.move === "disagree_prompt" ? msg : null,
        })
      : null;

  const socialText = social.preferLocalCompose
    ? composeSocialReply({
        move: social.move,
        ownerFirstName,
        message: msg,
        resolvedSubject: social.resolvedSubject,
        activeThread,
        workSignal,
        stance,
        memoryHint: memoryBlock,
      })
    : null;

  const sessionLine = params.sessionIdentity
    ? `SESSION AUTHENTIFIÉE : email=${params.sessionIdentity.email} ; rôleApplicatif=${params.sessionIdentity.appRole} ; rôleBase=${params.sessionIdentity.effectiveRole}`
    : "";

  const factsParts = [
    sessionLine,
    memoryBlock,
    activeThread
      ? `FIL SOCIAL : ${activeThread.status} · ${activeThread.subject} · ${activeThread.summary.slice(0, 200)}`
      : "",
    params.opsText ? `VÉRIFIÉ À L'INSTANT (OPS) :\n${params.opsText}` : "",
    toolRun?.factsText
      ? `VÉRIFIÉ À L'INSTANT (OUTILS) :\n${
          social.preferShort || intent.preferShort
            ? toolRun.factsText.slice(0, 1800)
            : toolRun.factsText
        }`
      : "",
    toolRun?.plan.needsClarification && toolRun.plan.clarification && !toolRun.results.length
      ? `CONSIGNE : ${toolRun.plan.clarification}`
      : "",
    `MOVE SOCIAL : ${social.move} ; sujet=${social.resolvedSubject || "aucun"}`,
  ].filter(Boolean);
  const factsBlock = factsParts.join("\n\n") || undefined;

  let openai: string | null = null;
  // Social local prioritaire : on n'appelle OpenAI que pour le travail « open »
  if (!social.preferLocalCompose) {
    try {
      openai = await chatAdminWithOpenAI({
        message: msg,
        history,
        factsBlock,
        sessionLine,
        intent: { ...intent, preferShort: social.preferShort || intent.preferShort },
        preferShort: social.preferShort || intent.preferShort,
      });
    } catch {
      openai = null;
    }
  }

  const local = localReply({
    message: msg,
    intent,
    clarification: toolRun?.plan.clarification,
    results: toolRun?.results || [],
    opsText: params.opsText,
    memoryHint: memoryBlock,
  });

  if (openai && looksLikeChatbot(openai)) {
    openai = null;
  }

  const hasTour = toolRun?.results.some((r) => r.ok && r.tool === "runDailyTour");
  if (openai && hasTour && (intent.preferShort || social.preferShort)) {
    openai = null;
  }

  let text = socialText || openai || local;
  text = dampenRepetition(text, social.preferShort || intent.preferShort);
  text = stripChatbotVoice(text, socialText || local);
  text = stripTechnicalLeak(
    text,
    "J'ai un souci de lecture sur les commandes pour l'instant — je ne te balance pas le détail technique. On réessaie ?"
  );

  // Anti-répétition vs dernières réponses
  if (
    isTooSimilarToRecent(text, sessionFingerprints) ||
    isTooSimilarToRecent(
      text,
      history.filter((h) => h.role === "assistant").slice(-2).map((h) => h.content)
    )
  ) {
    if (socialText && workSignal) {
      text = composeSocialReply({
        move: social.move === "greeting" ? "check_in" : social.move,
        ownerFirstName,
        message: msg + "|alt",
        resolvedSubject: social.resolvedSubject,
        activeThread,
        workSignal,
        stance,
        memoryHint: memoryBlock,
      });
    } else if (toolRun?.results.length) {
      text = shortFromTool(toolRun.results, intent.topicHint);
    } else {
      text = dampenRepetition(text, true);
      if (text.length > 200) {
        text =
          text.split(/[.!?]/).filter(Boolean).slice(0, 2).join(". ").trim() + ".";
      }
    }
  }

  const nextThread = nextThreadAfterTurn({
    move: social.move,
    previous: activeThread,
    subject: social.resolvedSubject || intent.topicHint,
    assistantText: text,
    userMessage: msg,
  });

  const grounded = Boolean(
    (toolRun?.results.some((r) => r.ok) ?? false) ||
      params.opsText ||
      memoryBlock ||
      social.move === "defer" ||
      social.move === "resume" ||
      Boolean(social.resolvedSubject)
  );

  if (params.userId) {
    try {
      await updateAdminMemoryAfterTurn({
        ownerUserId: params.userId,
        conversationId: params.conversationId || null,
        userMessage: msg,
        assistantText: text,
        intent: {
          ...intent,
          isPause: intent.isPause || social.move === "defer",
          isResume: intent.isResume || social.move === "resume",
          topicHint: social.resolvedSubject || intent.topicHint,
          preferShort: social.preferShort || intent.preferShort,
        },
        toolsUsed: toolRun?.plan.tools,
        history,
        activeThread: nextThread,
        socialMove: social.move,
      });
    } catch {
      /* optional */
    }
  }

  return {
    text,
    links: toolRun?.links || [],
    periodLabel: toolRun?.results.find((r) => r.periodLabel)?.periodLabel || "",
    source: socialText
      ? grounded
        ? "admin_ava_social+memory+tools"
        : "admin_ava_social+memory"
      : openai
        ? grounded
          ? "admin_ava_openai+memory+tools"
          : "admin_ava_openai+memory"
        : grounded
          ? "admin_ava_local+memory+tools"
          : "admin_ava_local+memory",
    lastSyncAt: null,
    missingData: toolRun?.missingData || [],
    conversational: true,
    grounded,
    intentLabel: `social:${social.move}|${toolRun?.plan.intentLabel || intent.intent}`,
    conversationalIntent: intent.intent,
    toolsUsed: toolRun?.plan.tools,
  };
}

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
