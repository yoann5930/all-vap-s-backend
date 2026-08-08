import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/jwt";
import {
  answerAdminAvaConversation,
  type AdminChatTurn,
} from "@/lib/ava-gestion/admin-conversation";
import { runFidelatooCommand, getFidelatooStatus } from "@/lib/fidelatoo/orchestrator";
import { writeAuditLog } from "@/lib/audit/log";
import { clientIp } from "@/lib/rate-limit";
import type { DatePeriod } from "@/lib/timezone/shop-tz";
import type { FidelatooCommand } from "@/lib/fidelatoo/types";
import {
  CLIENT_DEMO_EMAIL,
  resolveAvaSessionContext,
  stripClaimedPrivileges,
} from "@/lib/ava/identity-context";
import { getAvaSessionFromAuth } from "@/lib/auth/user-context";
import {
  AvaError,
  AvaErrorCode,
  redactAvaLog,
  toPublicAvaError,
} from "@/lib/ava/errors";
import {
  appendMessage,
  ensureConversation,
  listConversations,
  loadLegacyFlatMessages,
  loadMessages,
  saveLegacyFlatMessage,
} from "@/lib/ava/conversation-store";
import { loadMemoryForSurface } from "@/lib/ava/memory-store";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().min(1).optional().nullable(),
  periodKey: z
    .enum([
      "today",
      "yesterday",
      "this_week",
      "last_week",
      "this_month",
      "last_month",
      "last_7d",
      "last_30d",
    ])
    .optional(),
  confirmSensitive: z.boolean().optional(),
  retryOfErrorCode: z.string().optional(),
});

const SENSITIVE =
  /\b(supprim(er|e)|delete|wipe|mot\s*de\s*passe|password|dns|domaine|domain|paiement|abonnement|subscription|carte\s*bancaire|iban|révoquer\s+tous|revoke\s+all)\b/i;

function detectOpsCommand(message: string): FidelatooCommand | null {
  const m = message.toLowerCase();
  if (/diagnost|observe|état\s*(de\s*)?(l['’])?écran|voir\s+écran/.test(m)) return "ava.observe";
  if (/sync(hronise)?\s*identit|qui\s+suis|rôle\s+collabor/.test(m)) return "ava.sync_identity";
  if (/parcours\s*qr|récupère?\s*(mon\s*)?qr|qr\s*autonome|montre\s*(le\s*)?qr/.test(m))
    return "ava.autonomous_qr";
  if (/statut\s*(agent|ava)|agent\s*status|es[- ]tu\s+en\s+ligne/.test(m)) return "ava.agent_status";
  if (/journal|historique\s*(d['’])?actions/.test(m)) return "ava.journal";
  if (/démarr(er|e)\s*(la\s*)?vm|start\s*vm|ouvre\s*(la\s*)?vm/.test(m)) return "vm.start";
  if (/ouvre\s*(fidelatoo|l['’]app)/.test(m)) return "app.open";
  if (/vérifie?\s*(mon\s*)?rôle|verify\s*role/.test(m)) return "ava.verify_role";
  return null;
}

function toHistory(
  messages: { role: string; content: string }[]
): AdminChatTurn[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-12)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content || "").slice(0, 2500),
    }));
}

async function assertAdminAvaAccess(user: {
  userId: string;
  email: string;
  role: string;
}) {
  const email = (user.email || "").trim().toLowerCase();
  if (email === CLIENT_DEMO_EMAIL) {
    throw new AvaError(
      AvaErrorCode.AVA_PERMISSION_DENIED,
      "CLIENT demo email blocked from Admin AVA",
      "Accès Admin A.V.A. refusé pour ce compte."
    );
  }

  // Même identité que le reste de l'app — session réelle uniquement
  const ava = await getAvaSessionFromAuth("ADMIN");
  if (!ava || !ava.adminCapabilities) {
    throw new AvaError(
      AvaErrorCode.AVA_AUTH_FAILED,
      "No admin capabilities for AVA",
      "Session Admin requise pour A.V.A."
    );
  }

  const ctx = await resolveAvaSessionContext({
    userId: user.userId,
    email: user.email,
    sessionRole: user.role,
    surface: "admin",
  });
  if (!ctx.adminCapabilities) {
    throw new AvaError(
      AvaErrorCode.AVA_AUTH_FAILED,
      "No admin capabilities for AVA",
      "Session Admin requise pour A.V.A."
    );
  }
  return ctx;
}

type PersistMode = "threaded" | "legacy";

async function openThread(userId: string, conversationId?: string | null) {
  try {
    const conversation = await ensureConversation({
      userId,
      surface: "admin",
      conversationId,
    });
    const prior = await loadMessages(conversation.id);
    return { mode: "threaded" as PersistMode, conversation, prior };
  } catch {
    const prior = await loadLegacyFlatMessages(userId);
    return { mode: "legacy" as PersistMode, conversation: null, prior };
  }
}

async function persistUser(
  mode: PersistMode,
  userId: string,
  conversationId: string | null,
  content: string,
  meta: unknown
) {
  if (mode === "threaded" && conversationId) {
    await appendMessage({
      conversationId,
      role: "user",
      content,
      metaJson: meta,
    });
  } else {
    await saveLegacyFlatMessage({
      userId,
      role: "user",
      content,
      metaJson: meta,
    });
  }
}

async function persistAssistant(
  mode: PersistMode,
  userId: string,
  conversationId: string | null,
  content: string,
  opts: {
    status?: string;
    errorCode?: string | null;
    linksJson?: unknown;
    metaJson?: unknown;
  }
) {
  if (mode === "threaded" && conversationId) {
    await appendMessage({
      conversationId,
      role: "assistant",
      content,
      status: opts.status,
      errorCode: opts.errorCode,
      linksJson: opts.linksJson,
      metaJson: opts.metaJson,
    });
  } else {
    await saveLegacyFlatMessage({
      userId,
      role: "assistant",
      content,
      linksJson: opts.linksJson,
      metaJson: opts.metaJson,
      errorCode: opts.errorCode,
    });
  }
}

/** Chat Admin A.V.A. — conversationnelle, persistante, fail-closed. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth("ADMIN");
    const ctx = await assertAdminAvaAccess(user);
    const body = bodySchema.parse(await request.json());
    const ip = clientIp(request);
    const safeMessage = stripClaimedPrivileges(body.message);

    if (SENSITIVE.test(safeMessage) && !body.confirmSensitive) {
      await writeAuditLog({
        user,
        action: "ava.admin_chat.sensitive_blocked",
        ip,
        metadata: { preview: safeMessage.slice(0, 120) },
      });
      return jsonResponse({
        mode: "admin_ava",
        conversationId: body.conversationId || null,
        text:
          "Attention : ça touche une action sensible. Je ne l'exécute pas toute seule. " +
          "Confirme explicitement si tu veux seulement un diagnostic / plan — " +
          "suppression massive, mots de passe, DNS, paiements et droits admin restent sous ta validation.",
        links: [],
        needsConfirmation: true,
        periodLabel: "",
        source: "admin_ava_guard",
        lastSyncAt: null,
        missingData: [],
        conversational: true,
        effectiveRole: ctx.effectiveRole,
      });
    }

    const thread = await openThread(user.userId, body.conversationId);
    const conversationId = thread.conversation?.id || null;
    const history = toHistory(thread.prior);

    await persistUser(thread.mode, user.userId, conversationId, safeMessage, {
      mode: "admin_ava",
      effectiveRole: ctx.effectiveRole,
    });

    const ops = detectOpsCommand(safeMessage);
    let opsText = "";
    let opsExtra: Record<string, unknown> = {};
    let toolErrorCode: string | null = null;

    if (ops) {
      try {
        const result = await runFidelatooCommand(ops);
        opsExtra = {
          opsCommand: ops,
          opsOk: result.ok,
          opsMessage: result.message,
          status: result.status,
          agent: result.agent,
          identity: result.identity,
          qrReady: !!result.qrImageBase64 || !!result.qrExpiresAt,
        };
        opsText = [
          `Action : ${ops}`,
          result.ok ? "Résultat : OK" : "Résultat : échec",
          result.message || "",
          result.status
            ? `VM=${result.status.vm} · app=${result.status.app} · ava=${result.status.ava} · rôle=${result.status.role}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");
        if (!result.ok) toolErrorCode = AvaErrorCode.AVA_TOOL_ERROR;
        await writeAuditLog({
          user,
          action: `ava.admin_chat.ops.${ops}`,
          ip,
          metadata: {
            ok: result.ok,
            message: result.message?.slice(0, 200),
            actionId: result.actionId,
          },
        });
      } catch (e) {
        const pub = toPublicAvaError(e);
        toolErrorCode = AvaErrorCode.AVA_TOOL_ERROR;
        opsText = `Outil ${ops} indisponible : ${pub.publicMessage}`;
        opsExtra = { opsCommand: ops, opsOk: false, errorCode: toolErrorCode };
        console.error("[ava.admin] tool", redactAvaLog(pub.technical));
      }
    }

    let memoryHint = "";
    try {
      const mem = await loadMemoryForSurface({
        surface: "admin",
        userId: user.userId,
        adminCapabilities: true,
      });
      if (mem.admin) {
        memoryHint = `\nPréférences Admin mémorisées : ${JSON.stringify(mem.admin).slice(0, 400)}`;
      }
    } catch {
      /* optional */
    }

    let reply;
    try {
      reply = await answerAdminAvaConversation({
        message: safeMessage,
        role: user.role,
        history,
        periodKey: body.periodKey as DatePeriod | undefined,
        opsText: (opsText + memoryHint).trim() || undefined,
        sessionIdentity: {
          email: user.email,
          appRole: ctx.effectiveRole,
          effectiveRole: user.role,
        },
      });
    } catch (e) {
      const pub = toPublicAvaError(e);
      console.error("[ava.admin] engine", redactAvaLog(pub.technical));
      await persistAssistant(thread.mode, user.userId, conversationId, pub.publicMessage, {
        status: "error",
        errorCode: pub.code,
        metaJson: { technical: pub.technical, mode: "admin_ava" },
      });
      await writeAuditLog({
        user,
        action: "ava.admin_chat.error",
        ip,
        metadata: {
          errorCode: pub.code,
          technical: redactAvaLog(pub.technical),
          conversationId,
        },
      });
      return jsonResponse({
        mode: "admin_ava",
        conversationId,
        text: pub.publicMessage,
        errorCode: pub.code,
        links: [],
        conversational: true,
        canRetry: true,
        effectiveRole: ctx.effectiveRole,
        persistMode: thread.mode,
      });
    }

    const assistantStatus = toolErrorCode ? "error" : "ok";
    await persistAssistant(thread.mode, user.userId, conversationId, reply.text, {
      status: assistantStatus,
      errorCode: toolErrorCode,
      linksJson: reply.links,
      metaJson: {
        periodLabel: reply.periodLabel,
        source: reply.source,
        lastSyncAt: reply.lastSyncAt,
        missingData: reply.missingData,
        mode: "admin_ava",
        conversational: true,
        grounded: reply.grounded,
        effectiveRole: ctx.effectiveRole,
        ...opsExtra,
      },
    });

    await writeAuditLog({
      user,
      action: "ava.admin_chat.turn",
      ip,
      metadata: {
        mode: "admin_ava",
        conversationId,
        conversational: true,
        hasOps: !!ops,
        opsCommand: ops || null,
        source: reply.source,
        effectiveRole: ctx.effectiveRole,
        preview: safeMessage.slice(0, 120),
        errorCode: toolErrorCode,
        persistMode: thread.mode,
      },
    });

    return jsonResponse({
      mode: "admin_ava",
      conversationId,
      text: reply.text,
      links: reply.links,
      periodLabel: reply.periodLabel,
      source: reply.source,
      lastSyncAt: reply.lastSyncAt,
      missingData: reply.missingData,
      conversational: true,
      grounded: reply.grounded,
      errorCode: toolErrorCode,
      canRetry: !!toolErrorCode,
      effectiveRole: ctx.effectiveRole,
      persistMode: thread.mode,
      ...opsExtra,
    });
  } catch (error) {
    if (error instanceof AvaError) {
      return jsonResponse(
        {
          mode: "admin_ava",
          error: error.publicMessage,
          errorCode: error.code,
          conversational: true,
        },
        error.code === AvaErrorCode.AVA_PERMISSION_DENIED ||
          error.code === AvaErrorCode.AVA_AUTH_FAILED
          ? 403
          : 500
      );
    }
    const pub = toPublicAvaError(error);
    console.error("[ava.admin] fatal", redactAvaLog(pub.technical));
    if (
      error instanceof Error &&
      (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN")
    ) {
      return handleApiError(error);
    }
    return jsonResponse(
      {
        mode: "admin_ava",
        error: pub.publicMessage,
        errorCode: pub.code,
        technical: pub.technical,
        conversational: true,
        canRetry: true,
      },
      500
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth("ADMIN");
    const ctx = await assertAdminAvaAccess(user);
    const conversationId = request.nextUrl.searchParams.get("conversationId");

    const [conversations, status] = await Promise.all([
      listConversations(user.userId, "admin"),
      getFidelatooStatus().catch(() => null),
    ]);

    let messages: Awaited<ReturnType<typeof loadMessages>> | Awaited<
      ReturnType<typeof loadLegacyFlatMessages>
    > = [];
    let activeId = conversationId;
    let persistMode: PersistMode = "threaded";

    if (conversations.length === 0) {
      persistMode = "legacy";
      messages = await loadLegacyFlatMessages(user.userId);
      activeId = null;
    } else {
      if (activeId) {
        const owned = conversations.find((c) => c.id === activeId);
        if (owned) {
          messages = await loadMessages(activeId);
        } else {
          activeId = null;
        }
      }
      if (!activeId) {
        activeId = conversations[0].id;
        messages = await loadMessages(activeId);
      }
    }

    let agent: Record<string, unknown> | null = null;
    try {
      const ag = await runFidelatooCommand("ava.agent_status");
      agent = (ag.agent as Record<string, unknown>) || null;
    } catch {
      agent = null;
    }

    return jsonResponse({
      mode: "admin_ava",
      conversationId: activeId,
      conversations,
      messages,
      persistMode,
      status,
      agent,
      effectiveRole: ctx.effectiveRole,
      isOwnerIdentity: ctx.isOwnerIdentity,
      online: !!(
        status?.orchestratorReachable &&
        status.vm === "online" &&
        !(agent as { suspended?: boolean } | null)?.suspended
      ),
      suggestions: [
        "Bonjour Ava",
        "Que peux-tu faire ici ?",
        "Résumé du jour",
        "Y a-t-il des stocks faibles ?",
        "Quel est ton statut ?",
        "Fais un diagnostic écran",
        "Récupère mon QR",
      ],
    });
  } catch (error) {
    if (error instanceof AvaError) {
      return jsonResponse(
        { error: error.publicMessage, errorCode: error.code },
        403
      );
    }
    return handleApiError(error);
  }
}
