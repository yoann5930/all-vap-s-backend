import prisma from "@/lib/prisma";
import type { JwtPayload } from "@/lib/jwt";
import type { Prisma } from "@prisma/client";

export type AuditInput = {
  user?: JwtPayload | null;
  action: string;
  storeCode?: string | null;
  productId?: string | null;
  productName?: string | null;
  inventoryId?: string | null;
  oldQuantity?: number | null;
  newQuantity?: number | null;
  sessionId?: string | null;
  deviceInfo?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Enregistre une action traçable — jamais de mot de passe dans metadata. */
export async function writeAuditLog(input: AuditInput): Promise<void> {
  try {
    const meta: Record<string, unknown> | undefined = input.metadata
      ? { ...input.metadata }
      : undefined;
    if (meta) {
      for (const key of Object.keys(meta)) {
        if (/password|secret|token|hash/i.test(key)) delete meta[key];
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: input.user?.userId || null,
        userEmail: input.user?.email || null,
        userRole: input.user?.role || null,
        action: input.action,
        storeCode: input.storeCode || null,
        productId: input.productId || null,
        productName: input.productName || null,
        inventoryId: input.inventoryId || null,
        oldQuantity: input.oldQuantity ?? null,
        newQuantity: input.newQuantity ?? null,
        sessionId: input.sessionId || null,
        deviceInfo: input.deviceInfo || null,
        ip: input.ip || null,
        metadata: (meta as Prisma.InputJsonValue) || undefined,
      },
    });
  } catch (err) {
    console.error("[audit] write failed:", err instanceof Error ? err.message : "unknown");
  }
}
