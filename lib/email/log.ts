import prisma from "@/lib/prisma";
import { maskEmail } from "./mask";
import type { EmailType } from "./types";

export async function findSuccessfulEmailLog(idempotencyKey: string) {
  try {
    return await prisma.emailLog.findFirst({
      where: { idempotencyKey, status: "SENT" },
    });
  } catch {
    // Table absente avant migration — ne bloque pas l'envoi
    return null;
  }
}

export async function createEmailLog(params: {
  type: EmailType;
  recipient: string;
  subject: string;
  relatedOrderId?: string;
  relatedCustomerId?: string;
  idempotencyKey?: string;
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  attempts?: number;
  lastErrorCode?: string | null;
  transport?: string | null;
}) {
  try {
    return await prisma.emailLog.create({
      data: {
        type: params.type,
        recipientMasked: maskEmail(params.recipient),
        subject: params.subject.slice(0, 240),
        relatedOrderId: params.relatedOrderId || null,
        relatedCustomerId: params.relatedCustomerId || null,
        idempotencyKey: params.idempotencyKey || null,
        status: params.status,
        attempts: params.attempts ?? 1,
        lastErrorCode: params.lastErrorCode || null,
        transport: params.transport || null,
        sentAt: params.status === "SENT" ? new Date() : null,
      },
    });
  } catch {
    return null;
  }
}

export async function markEmailLog(
  id: string | null | undefined,
  data: {
    status: "SENT" | "FAILED" | "SKIPPED";
    lastErrorCode?: string | null;
    transport?: string | null;
    attempts?: number;
  }
) {
  if (!id) return;
  try {
    await prisma.emailLog.update({
      where: { id },
      data: {
        status: data.status,
        lastErrorCode: data.lastErrorCode ?? null,
        transport: data.transport ?? undefined,
        attempts: data.attempts,
        sentAt: data.status === "SENT" ? new Date() : undefined,
      },
    });
  } catch {
    /* ignore */
  }
}
