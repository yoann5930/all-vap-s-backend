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
  forceGroundedReply,
  isTooSimilarToRecent,
  loadAdminPersistentMemory,
  loadAdminSessionMemory,
  looksLikeBannedGeneric,
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
  shouldPreferLocalCompose,
  type ActiveThread,
} from "@/lib/ava/admin-social";
import {
  adminLlmUnavailableMessage,
  chatWithAvaLlm,
  type AvaLlmFailureKind,
} from "@/lib/ai/providers";

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
  openaiStatus?: {
    kind: AvaLlmFailureKind;
    httpStatus: number | null;
    apiCode: string | null;
    attempts: number;
    provider?: "local" | "openai" | "none";
    tried?: Array<"local" | "openai">;
  };
  llmStatus?: {
    kind: AvaLlmFailureKind;
    httpStatus: number | null;
    apiCode: string | null;
    attempts: number;
    provider: "local" | "openai" | "none";
    tried: Array<"local" | "openai">;
    model: string | null;
  };
};

const ADMIN_SYSTEM = `Tu es A.V.A., collaboratrice numérique senior All Vap's (Hautmont & Le Quesnoy) — mode Admin uniquement, jamais vendeuse client.

STYLE :
- collègue qui travaille déjà, pas chatbot d'accueil ;
- naturel, direct, tutoiement ; phrases courtes si question simple ;
- continue la conversation ; références (« ça », « pourquoi », « l'autre boutique », « on reprend ») via MÉMOIRE et HISTORIQUE ;
- tu peux avoir un avis argumenté et ne pas être d'accord ; si une donnée contredit ton idée, tu changes d'avis clairement ;
- pas de chaîne de pensée privée : structure métier (observation / hypothèse / idée / risque / confiance) quand c'est utile ;
- si le contexte outils contient un tour / anomalies / idées : réutilise-les en prose humaine, ne redis pas un menu.

ANTI-RÉPÉTITION (critique) :
- ne jamais recycler « Je te suis », « Dis-moi ce qui te préoccupe », ni une formule déjà dite dans l'historique ;
- chaque réponse doit avancer : répondre précisément au DERNIER message de l'admin ;
- si tu n'as pas l'info : dis-le clairement, sans blabla générique.

RÈGLES :
- n'invente jamais chiffres, stocks, droits, états ;
- ne prétends jamais te souvenir d'un fait absent de CONTEXTE UTILE / MÉMOIRE ;
- distingue : mémoire vs outils vérifiés vs observation marché web vs inconnu ;
- corrélation ≠ causalité ; données insuffisantes → le dire ;
- ne propose pas systématiquement une remise ; préfère tests mesurables (visibilité, contenu, animation) quand pertinent ;
- actions sensibles (prix, promos, commandes fournisseurs, suppression, DNS, déploiement, paiements) : proposer/préparer seulement → validation humaine ;
- jamais de fuite de données Admin vers un contexte client.

${ADMIN_COLLEAGUE_SYSTEM_EXTRA}

INTENTION COURANTE indique réponse courte ou détaillée.`;

type LlmChatOutcome = {
  text: string | null;
  kind: AvaLlmFailureKind;
  httpStatus: number | null;
  apiCode: string | null;
  attempts: number;
  provider: "local" | "openai" | "none";
  tried: Array<"local" | "openai">;
  model: string | null;
};

async function chatAdminWithLlm(params: {
  message: string;
  history: AdminChatTurn[];
  factsBlock?: string;
  sessionLine?: string;
  intent: AdminIntentAnalysis;
  preferShort: boolean;
  antiRepeatHint?: string;
}): Promise<LlmChatOutcome> {
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
    params.antiRepeatHint
      ? `CONSIGNE ANTI-RÉPÉTITION : ${params.antiRepeatHint}`
      : "",
    "",
    `Message admin (réponds À CE MESSAGE, pas à un message précédent) : ${params.message}`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await chatWithAvaLlm({
    messages: [
      { role: "system", content: ADMIN_SYSTEM },
      ...historyMessages,
      { role: "user", content: userContent },
    ],
    maxTokens: params.preferShort ? 320 : 900,
    temperature: params.preferShort ? 0.45 : 0.55,
    preferShort: params.preferShort,
    logTag: "ava-admin-llm",
  });

  return {
    text: result.text,
    kind: result.kind,
    httpStatus: result.httpStatus,
    apiCode: result.apiCode,
    attempts: result.attempts,
    provider: result.provider,
    tried: result.tried,
    model: result.model,
  };
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

  const useLocalSocial = shouldPreferLocalCompose(
    social.move,
    social.preferLocalCompose
  );

  const socialText = useLocalSocial
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

  const recentUser = history
    .filter((h) => h.role === "user")
    .slice(-3)
    .map((h) => h.content.slice(0, 160))
    .join(" | ");

  const factsParts = [
    sessionLine,
    memoryBlock,
    activeThread
      ? `FIL SOCIAL : ${activeThread.status} · ${activeThread.subject} · ${activeThread.summary.slice(0, 200)}`
      : "",
    recentUser ? `DERNIERS MESSAGES ADMIN : ${recentUser}` : "",
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

  let llmText: string | null = null;
  let llmMeta: LlmChatOutcome | null = null;
  // Social local seulement pour salut / check-in / defer… — le reste passe par le routeur LLM
  if (!useLocalSocial) {
    try {
      llmMeta = await chatAdminWithLlm({
        message: msg,
        history,
        factsBlock,
        sessionLine,
        intent: { ...intent, preferShort: social.preferShort || intent.preferShort },
        preferShort: social.preferShort || intent.preferShort,
      });
      llmText = llmMeta.text;
    } catch {
      llmText = null;
      llmMeta = {
        text: null,
        kind: "throw",
        httpStatus: null,
        apiCode: null,
        attempts: 0,
        provider: "none",
        tried: [],
        model: null,
      };
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

  const llmHardFail =
    Boolean(llmMeta) &&
    !llmText &&
    llmMeta!.kind !== "ok" &&
    [
      "insufficient_quota",
      "rate_limit_exceeded",
      "tokens_limit",
      "auth_rejected",
      "missing_key",
      "model_not_found",
      "provider_unavailable",
      "network_error",
      "network_timeout",
    ].includes(llmMeta!.kind);

  const hasToolFacts = Boolean(toolRun?.results.some((r) => r.ok));

  // Pas de faux « OK je continue » quand le LLM est down — sauf si outils métier ont déjà répondu
  const socialFallback =
    !useLocalSocial &&
    !llmText &&
    !llmHardFail &&
    (social.move === "smalltalk" ||
      social.move === "light_ack" ||
      social.move === "work")
      ? composeSocialReply({
          move: social.move === "work" ? "light_ack" : social.move,
          ownerFirstName,
          message: msg,
          resolvedSubject: social.resolvedSubject,
          activeThread,
          workSignal,
          stance: null,
          memoryHint: memoryBlock,
        })
      : null;

  const llmUnavailableText =
    llmHardFail && !hasToolFacts
      ? adminLlmUnavailableMessage(llmMeta!.kind, llmMeta!.tried)
      : llmHardFail && hasToolFacts
        ? `${shortFromTool(toolRun!.results, intent.topicHint)} (Note : cerveau LLM indisponible — ${llmMeta!.kind} / ${llmMeta!.provider}.)`
        : null;

  if (llmText && looksLikeChatbot(llmText)) {
    llmText = null;
  }
  if (llmText && looksLikeBannedGeneric(llmText)) {
    llmText = null;
  }

  const hasTour = toolRun?.results.some((r) => r.ok && r.tool === "runDailyTour");
  if (llmText && hasTour && (intent.preferShort || social.preferShort)) {
    llmText = null;
  }

  let text = socialText || llmText || llmUnavailableText || socialFallback || local;
  const pickedLlmUnavailable = Boolean(
    llmUnavailableText && text === llmUnavailableText
  );
  text = dampenRepetition(text, social.preferShort || intent.preferShort);
  text = stripChatbotVoice(
    text,
    socialText || llmUnavailableText || socialFallback || local
  );
  text = stripTechnicalLeak(
    text,
    "J'ai un souci de lecture sur les commandes pour l'instant — je ne te balance pas le détail technique. On réessaie ?"
  );

  const recentAssistantTexts = [
    ...sessionFingerprints,
    ...history.filter((h) => h.role === "assistant").slice(-3).map((h) => h.content),
  ];

  // Anti-répétition vs dernières réponses
  if (
    looksLikeBannedGeneric(text) ||
    isTooSimilarToRecent(text, recentAssistantTexts)
  ) {
    // Moves structurés locaux : variante, jamais « reformule en une phrase »
    if (
      social.move === "greeting" ||
      social.move === "check_in" ||
      social.move === "thanks" ||
      social.move === "identity" ||
      social.move === "defer" ||
      social.move === "resume" ||
      social.move === "leave_work" ||
      social.move === "ask_opinion" ||
      social.move === "disagree_prompt"
    ) {
      text = composeSocialReply({
        move: social.move,
        ownerFirstName,
        message: msg + "|alt|" + String(recentAssistantTexts.length),
        resolvedSubject: social.resolvedSubject,
        activeThread,
        workSignal: social.move === "ask_opinion" || social.move === "disagree_prompt" ? workSignal : null,
        stance,
        memoryHint: memoryBlock,
      });
    } else {
      let rewritten: string | null = null;
      if (!useLocalSocial && !llmHardFail) {
        try {
          const rewriteMeta = await chatAdminWithLlm({
            message: msg,
            history,
            factsBlock,
            sessionLine,
            intent: { ...intent, preferShort: true },
            preferShort: true,
            antiRepeatHint:
              "Ta précédente réponse était trop générique ou répétitive. Reformule complètement. Interdit : « Je te suis », « Dis-moi ce qui te préoccupe ». Réponds au dernier message admin.",
          });
          rewritten = rewriteMeta.text;
          if (!llmMeta || llmMeta.kind === "ok") llmMeta = rewriteMeta;
          if (rewritten) llmText = rewritten;
        } catch {
          rewritten = null;
        }
      }
      if (
        rewritten &&
        !looksLikeBannedGeneric(rewritten) &&
        !isTooSimilarToRecent(rewritten, recentAssistantTexts, 0.55)
      ) {
        text = rewritten;
      } else if (toolRun?.results.length) {
        text = shortFromTool(toolRun.results, intent.topicHint);
      } else if (workSignal) {
        text = composeSocialReply({
          move: social.move === "work" ? "light_ack" : social.move,
          ownerFirstName,
          message: msg + "|alt",
          resolvedSubject: social.resolvedSubject,
          activeThread,
          workSignal,
          stance,
          memoryHint: memoryBlock,
        });
      } else {
        text = forceGroundedReply({
          userMessage: msg,
          recentAssistant: recentAssistantTexts,
          ownerFirstName,
          threadSubject: activeThread?.subject || social.resolvedSubject,
        });
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

  const usedUnavailable = pickedLlmUnavailable && !llmText;
  const llmProvider = llmMeta?.provider || "none";
  const llmSourceOk =
    llmText && llmProvider === "local"
      ? grounded
        ? "admin_ava_local_llm+memory+tools"
        : "admin_ava_local_llm+memory"
      : llmText && llmProvider === "openai"
        ? grounded
          ? "admin_ava_openai+memory+tools"
          : "admin_ava_openai+memory"
        : null;

  return {
    text,
    links: toolRun?.links || [],
    periodLabel: toolRun?.results.find((r) => r.periodLabel)?.periodLabel || "",
    source: socialText
      ? grounded
        ? "admin_ava_social+memory+tools"
        : "admin_ava_social+memory"
      : llmSourceOk
        ? llmSourceOk
        : usedUnavailable
          ? `admin_ava_llm_unavailable:${llmMeta?.kind || "unknown"}`
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
    openaiStatus: llmMeta
      ? {
          kind: llmMeta.kind,
          httpStatus: llmMeta.httpStatus,
          apiCode: llmMeta.apiCode,
          attempts: llmMeta.attempts,
          provider: llmMeta.provider,
          tried: llmMeta.tried,
        }
      : undefined,
    llmStatus: llmMeta
      ? {
          kind: llmMeta.kind,
          httpStatus: llmMeta.httpStatus,
          apiCode: llmMeta.apiCode,
          attempts: llmMeta.attempts,
          provider: llmMeta.provider,
          tried: llmMeta.tried,
          model: llmMeta.model,
        }
      : undefined,
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
