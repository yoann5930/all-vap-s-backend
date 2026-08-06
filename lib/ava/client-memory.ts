/**
 * Mémoire client A.V.A. — accès uniquement via customerId authentifié.
 */
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  ensureClientMemory,
  refreshClientMemoryFromOrders,
} from "@/lib/ava-memory/service";

async function audit(userId: string, action: string, meta?: Record<string, unknown>) {
  await prisma.avaMemoryAuditLog.create({
    data: {
      userId,
      actorUserId: userId,
      action,
      metaJson: (meta as Prisma.InputJsonValue) || undefined,
    },
  });
}

export async function getClientAvaMemory(userId: string) {
  await ensureClientMemory(userId);
  await refreshClientMemoryFromOrders(userId).catch(() => null);

  const memory = await prisma.avaClientMemory.findUnique({ where: { userId } });
  const devices = await prisma.avaOwnedDevice.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  const consents = await prisma.avaMemoryConsent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const summaries = await prisma.avaConversationSummary.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const diagnostics = await prisma.avaDiagnosticIncident.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      manufacturer: true,
      model: true,
      symptomFreeText: true,
      riskLevel: true,
      status: true,
      createdAt: true,
      recommendations: true,
    },
  });

  await audit(userId, "memory.read");

  return {
    memory: memory
      ? {
          preferredBrands: memory.preferredBrands,
          preferredRanges: memory.preferredRanges,
          preferredFlavors: memory.preferredFlavors,
          usualNicotineMg: memory.usualNicotineMg,
          conversationalMemoryEnabled: memory.conversationalMemoryEnabled,
          updatedAt: memory.updatedAt,
        }
      : null,
    devices,
    consents,
    summaries,
    diagnostics,
  };
}

export async function setConversationalMemory(userId: string, enabled: boolean) {
  await ensureClientMemory(userId);
  await prisma.avaClientMemory.update({
    where: { userId },
    data: { conversationalMemoryEnabled: enabled },
  });
  await prisma.avaMemoryConsent.create({
    data: {
      userId,
      kind: "conversational",
      granted: enabled,
      source: "client_settings",
    },
  });
  await audit(userId, enabled ? "memory.enable" : "memory.disable");
  return { ok: true, conversationalMemoryEnabled: enabled };
}

export async function upsertOwnedDevice(
  userId: string,
  input: {
    id?: string;
    manufacturer: string;
    model: string;
    modelSlug?: string;
    productId?: string;
    notes?: string;
  },
) {
  if (/jnr|puff|jetable/i.test(`${input.manufacturer} ${input.model}`)) {
    return { ok: false as const, error: "Matériel hors périmètre A.V.A. (JNR / puff / jetable)." };
  }
  if (input.id) {
    const existing = await prisma.avaOwnedDevice.findFirst({
      where: { id: input.id, userId },
    });
    if (!existing) return { ok: false as const, error: "Appareil introuvable." };
    const device = await prisma.avaOwnedDevice.update({
      where: { id: input.id },
      data: {
        manufacturer: input.manufacturer,
        model: input.model,
        modelSlug: input.modelSlug,
        productId: input.productId,
        notes: input.notes,
      },
    });
    await audit(userId, "device.update", { deviceId: device.id });
    return { ok: true as const, device };
  }
  const device = await prisma.avaOwnedDevice.create({
    data: {
      userId,
      manufacturer: input.manufacturer,
      model: input.model,
      modelSlug: input.modelSlug,
      productId: input.productId,
      notes: input.notes,
    },
  });
  await audit(userId, "device.create", { deviceId: device.id });
  return { ok: true as const, device };
}

export async function deleteOwnedDevice(userId: string, deviceId: string) {
  const existing = await prisma.avaOwnedDevice.findFirst({
    where: { id: deviceId, userId },
  });
  if (!existing) return { ok: false as const, error: "Introuvable" };
  await prisma.avaOwnedDevice.delete({ where: { id: deviceId } });
  await audit(userId, "device.delete", { deviceId });
  return { ok: true as const };
}

/** Supprime les données d'assistance non obligatoires (garde commandes). */
export async function purgeAssistanceMemory(userId: string) {
  await prisma.avaConversationSummary.deleteMany({ where: { userId } });
  await prisma.avaOwnedDevice.deleteMany({ where: { userId } });
  await prisma.avaClientMemory.updateMany({
    where: { userId },
    data: {
      conversationalMemoryEnabled: false,
      summaryJson: undefined,
      preferredFlavors: [],
      ownedDevicesJson: undefined,
    },
  });
  await audit(userId, "memory.purge_assistance");
  return { ok: true };
}

export async function exportClientMemory(userId: string) {
  const data = await getClientAvaMemory(userId);
  await audit(userId, "memory.export");
  return {
    exportedAt: new Date().toISOString(),
    customerId: userId,
    ...data,
  };
}
