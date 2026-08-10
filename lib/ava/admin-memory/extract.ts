import {
  loadAdminPersistentMemory,
  loadAdminSessionMemory,
  saveAdminSessionMemory,
  upsertAdminMemoryItem,
  updateTaskBySubject,
} from "./store";
import type { AdminIntentAnalysis, AdminSessionMemory } from "./types";
import { makeReplyFingerprint } from "./anti-repeat";

type Turn = { role: "user" | "assistant"; content: string };

/**
 * Met à jour mémoire session + éventuels faits après un tour.
 * Pas de chaîne de pensée — faits / tâches / résumé seulement.
 */
export async function updateAdminMemoryAfterTurn(params: {
  ownerUserId: string;
  conversationId: string | null;
  userMessage: string;
  assistantText: string;
  intent: AdminIntentAnalysis;
  toolsUsed?: string[];
  history: Turn[];
  activeThread?: AdminSessionMemory["activeThread"];
  socialMove?: string;
}): Promise<void> {
  const { ownerUserId, conversationId, userMessage, assistantText, intent } = params;
  if (!conversationId) return;

  try {
    if (intent.isPause || params.socialMove === "defer") {
      await updateTaskBySubject(
        ownerUserId,
        intent.topicHint ||
          params.activeThread?.subject ||
          extractProjectHint(userMessage) ||
          "projet en cours",
        "paused"
      );
      await upsertAdminMemoryItem(ownerUserId, {
        kind: "pending_decision",
        subject: params.activeThread?.subject || intent.topicHint || "sujet reporté",
        content: `Reporté : ${(params.activeThread?.summary || assistantText).slice(0, 200)}`,
        importance: "medium",
        taskStatus: "paused",
        source: "user",
      });
    }
    if (intent.isResume || params.socialMove === "resume") {
      await updateTaskBySubject(
        ownerUserId,
        intent.topicHint ||
          params.activeThread?.subject ||
          extractProjectHint(userMessage) ||
          "projet en cours",
        "in_progress"
      );
    }

    if (intent.isCorrection) {
      const fact = extractCorrectionFact(userMessage);
      if (fact) {
        await upsertAdminMemoryItem(ownerUserId, {
          kind: "confirmed_fact",
          subject: fact.subject,
          content: fact.content,
          importance: "high",
          source: "correction",
        });
      }
    }

    // Demande explicite de mémorisation (« Mémorise : … », « retenons que … »)
    const memorize = extractMemorizeFact(userMessage);
    if (memorize) {
      await upsertAdminMemoryItem(ownerUserId, {
        kind: "confirmed_fact",
        subject: memorize.subject,
        content: memorize.content,
        importance: "high",
        source: "user",
      });
    }

    // Décision / projet en cours
    if (
      /on (va|fait|teste|garde|lance)|d[eé]cision|mission|projet|todo|à faire/i.test(userMessage) &&
      userMessage.length > 12 &&
      userMessage.length < 280
    ) {
      await upsertAdminMemoryItem(ownerUserId, {
        kind: /pr[eé]f[eè]re|toujours/i.test(userMessage)
          ? "user_preference"
          : "pending_decision",
        subject:
          params.activeThread?.subject ||
          intent.topicHint ||
          extractProjectHint(userMessage) ||
          "decision",
        content: userMessage.slice(0, 300),
        importance: "high",
        taskStatus: intent.isPause || params.socialMove === "defer" ? "paused" : "in_progress",
        source: "user",
      });
    }

    // Faits outils / statut utiles (courts)
    if (intent.topicHint && intent.preferShort && assistantText.length < 900) {
      await upsertAdminMemoryItem(ownerUserId, {
        kind: "temporary_context",
        subject: intent.topicHint,
        content: assistantText.slice(0, 280),
        importance: "medium",
        source: "ava",
      });
    }

    const session = await loadAdminSessionMemory(ownerUserId, conversationId);
    const next: AdminSessionMemory = {
      ...session,
      lastTopic:
        params.activeThread?.subject || intent.topicHint || session.lastTopic,
      lastTools: params.toolsUsed?.length ? params.toolsUsed : session.lastTools,
      recentActions: [
        `${params.socialMove || intent.intent}:${userMessage.slice(0, 80)}`,
        ...session.recentActions,
      ].slice(0, 8),
      recentReplyFingerprints: [
        makeReplyFingerprint(assistantText),
        ...session.recentReplyFingerprints,
      ].slice(0, 5),
      activeThread:
        params.activeThread !== undefined ? params.activeThread : session.activeThread,
      summary: buildSessionSummary(params.history, userMessage, assistantText, intent),
      updatedAt: new Date().toISOString(),
    };
    await saveAdminSessionMemory(ownerUserId, next);

    // Préférence explicite
    if (/je prefere|prefere que|toujours|desormais/i.test(userMessage)) {
      await upsertAdminMemoryItem(ownerUserId, {
        kind: "user_preference",
        subject: "preference",
        content: userMessage.slice(0, 200),
        importance: "medium",
        source: "user",
      });
    }
  } catch {
    /* mémoire optionnelle — ne jamais casser le chat */
  }
}

function extractProjectHint(msg: string): string | null {
  const m = msg.match(
    /(?:pause|reprend(?:re|s)?|continu(?:e|er)?)\s+(?:de\s+|la\s+|le\s+|l['’])?(.{3,40})/i
  );
  if (m?.[1]) return m[1].replace(/[?.!].*$/, "").trim();
  if (/migration/i.test(msg)) return "migration";
  return null;
}

function extractCorrectionFact(
  msg: string
): { subject: string; content: string } | null {
  const m = msg.match(
    /(?:en\s+fait|plut[oô]t|correction)\s*[:,]?\s*(.+)$/i
  );
  if (m?.[1]) {
    return { subject: "correction", content: m[1].trim().slice(0, 300) };
  }
  if (/collaboratrice/i.test(msg)) {
    return {
      subject: "ava_role_fidelatoo",
      content: msg.slice(0, 300),
    };
  }
  return { subject: "correction_utilisateur", content: msg.slice(0, 300) };
}

/** « Mémorise exactement : le code rayon est XYZ » → confirmed_fact durable. */
function extractMemorizeFact(
  msg: string
): { subject: string; content: string } | null {
  if (
    !/\b(m[eé]morise|reten(?:s|ir|ons)|souviens[- ]toi|note\s+(?:que|ceci|exactement)|enregistre)\b/i.test(
      msg
    )
  ) {
    return null;
  }

  const code = msg.match(
    /code\s+(rayon|magasin|secret)\s+(?:est\s+|:\s*)?([A-Za-z0-9_\-]+)/i
  );
  if (code) {
    const kind = code[1].toLowerCase();
    return {
      subject: `code_${kind}`,
      content: `Le code ${kind} est ${code[2]}`,
    };
  }

  const after = msg.match(
    /(?:m[eé]morise(?:\s+ceci)?(?:\s+exactement)?|reten(?:s|ir|ons)|souviens[- ]toi|note\s+(?:que|ceci|exactement)|enregistre)\s*[:\-–]?\s*(.+)$/i
  );
  const content = (after?.[1] || msg).trim().slice(0, 300);
  if (content.length < 6) return null;

  const subjectHint =
    content.match(/\bcode\s+(rayon|magasin|secret)\b/i)?.[0]?.replace(/\s+/g, "_") ||
    content
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) ||
    "fait_memorise";

  return { subject: subjectHint, content };
}

function buildSessionSummary(
  history: Turn[],
  userMessage: string,
  assistantText: string,
  intent: AdminIntentAnalysis
): string {
  const bits = [
    intent.topicHint ? `sujet=${intent.topicHint}` : null,
    intent.isPause ? "pause demandée" : null,
    intent.isResume ? "reprise demandée" : null,
    `dernier user: ${userMessage.slice(0, 100)}`,
    `dernier ava: ${assistantText.slice(0, 160)}`,
    `tours=${history.length + 1}`,
  ].filter(Boolean);
  return bits.join(" · ").slice(0, 700);
}

export async function getAdminMemorySnapshot(ownerUserId: string) {
  const persistent = await loadAdminPersistentMemory(ownerUserId);
  return {
    updatedAt: persistent.updatedAt,
    facts: persistent.items.filter((i) => i.status === "active"),
    supersededCount: persistent.items.filter((i) => i.status === "superseded").length,
  };
}
