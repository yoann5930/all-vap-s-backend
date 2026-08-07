import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/jwt";
import { answerAvaGestion } from "@/lib/ava-gestion/advisor";
import { runFidelatooCommand, getFidelatooStatus } from "@/lib/fidelatoo/orchestrator";
import { writeAuditLog } from "@/lib/audit/log";
import { clientIp } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";
import type { DatePeriod } from "@/lib/timezone/shop-tz";
import type { FidelatooCommand } from "@/lib/fidelatoo/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
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
});

const SENSITIVE =
  /\b(supprim(er|e)|delete|wipe|mot\s*de\s*passe|password|dns|domaine|domain|paiement|abonnement|subscription|carte\s*bancaire|iban|révoquer\s+tous|revoke\s+all)\b/i;

type StoredMsg = {
  role: string;
  content: string;
  linksJson?: unknown;
  metaJson?: unknown;
};

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

async function saveChatMessage(input: {
  userId: string;
  role: string;
  content: string;
  linksJson?: unknown;
  metaJson?: unknown;
}): Promise<void> {
  try {
    await prisma.avaGestionMessage.create({
      data: {
        userId: input.userId,
        role: input.role,
        content: input.content,
        linksJson: input.linksJson as object | undefined,
        metaJson: input.metaJson as object | undefined,
      },
    });
  } catch {
    // Table absente ou client non synchronisé — AuditLog reste la source journal.
  }
}

async function loadChatMessages(userId: string): Promise<StoredMsg[]> {
  try {
    const rows = await prisma.avaGestionMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return rows.reverse().map((r) => ({
      role: r.role,
      content: r.content,
      linksJson: r.linksJson,
      metaJson: r.metaJson,
    }));
  } catch {
    const logs = await prisma.auditLog.findMany({
      where: { userId, action: "ava.admin_chat.turn" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const out: StoredMsg[] = [];
    for (const log of logs.reverse()) {
      const meta = (log.metadata || {}) as {
        userMessage?: string;
        assistantText?: string;
        links?: unknown;
      };
      if (meta.userMessage) out.push({ role: "user", content: meta.userMessage });
      if (meta.assistantText)
        out.push({
          role: "assistant",
          content: meta.assistantText,
          linksJson: meta.links,
        });
    }
    return out;
  }
}

/** Chat Admin A.V.A. — ADMIN uniquement, moteur gestion existant + ops autonomes. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth("ADMIN");
    const body = bodySchema.parse(await request.json());
    const ip = clientIp(request);

    if (SENSITIVE.test(body.message) && !body.confirmSensitive) {
      await writeAuditLog({
        user,
        action: "ava.admin_chat.sensitive_blocked",
        ip,
        metadata: { preview: body.message.slice(0, 120) },
      });
      return jsonResponse({
        mode: "admin_ava",
        text:
          "Action sensible détectée. Je ne l’exécute pas automatiquement.\n" +
          "Confirme explicitement dans l’interface (confirmSensitive) si tu veux que je prépare uniquement le diagnostic — " +
          "suppression massive, mots de passe, DNS, paiements et droits admin restent soumis à ta validation.",
        links: [],
        needsConfirmation: true,
        periodLabel: "",
        source: "admin_ava_guard",
        lastSyncAt: null,
        missingData: [],
      });
    }

    await saveChatMessage({
      userId: user.userId,
      role: "user",
      content: body.message,
      metaJson: { mode: "admin_ava" },
    });

    const ops = detectOpsCommand(body.message);
    let opsText = "";
    let opsExtra: Record<string, unknown> = {};

    if (ops) {
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
        `⚙️ Action autonome : ${ops}`,
        result.ok ? "Résultat : OK" : "Résultat : échec",
        result.message || "",
        result.status
          ? `VM=${result.status.vm} · app=${result.status.app} · ava=${result.status.ava} · rôle=${result.status.role}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

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
    }

    const reply = await answerAvaGestion({
      message: body.message,
      role: user.role,
      periodKey: body.periodKey as DatePeriod | undefined,
    });

    const text = opsText ? `${opsText}\n\n———\n\n${reply.text}` : reply.text;

    await saveChatMessage({
      userId: user.userId,
      role: "assistant",
      content: text,
      linksJson: reply.links,
      metaJson: {
        periodLabel: reply.periodLabel,
        source: reply.source,
        lastSyncAt: reply.lastSyncAt,
        missingData: reply.missingData,
        mode: "admin_ava",
        ...opsExtra,
      },
    });

    await writeAuditLog({
      user,
      action: "ava.admin_chat.turn",
      ip,
      metadata: {
        mode: "admin_ava",
        hasOps: !!ops,
        opsCommand: ops || null,
        userMessage: body.message.slice(0, 2000),
        assistantText: text.slice(0, 8000),
        links: reply.links,
        preview: body.message.slice(0, 120),
      },
    });

    return jsonResponse({
      mode: "admin_ava",
      text,
      links: reply.links,
      periodLabel: reply.periodLabel,
      source: reply.source,
      lastSyncAt: reply.lastSyncAt,
      missingData: reply.missingData,
      ...opsExtra,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET() {
  try {
    const user = await requireAuth("ADMIN");
    const [messages, status] = await Promise.all([
      loadChatMessages(user.userId),
      getFidelatooStatus().catch(() => null),
    ]);

    let agent: Record<string, unknown> | null = null;
    try {
      const ag = await runFidelatooCommand("ava.agent_status");
      agent = (ag.agent as Record<string, unknown>) || null;
    } catch {
      agent = null;
    }

    return jsonResponse({
      mode: "admin_ava",
      messages,
      status,
      agent,
      online: !!(
        status?.orchestratorReachable &&
        status.vm === "online" &&
        !(agent as { suspended?: boolean } | null)?.suspended
      ),
      suggestions: [
        "Résumé du jour",
        "Stocks faibles",
        "Quel est ton statut ?",
        "Fais un diagnostic écran",
        "Synchronise mon identité collaboratrice",
        "Récupère mon QR",
        "Vérifie mon rôle",
      ],
    });
  } catch (error) {
    return handleApiError(error);
  }
}
