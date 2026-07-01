import prisma from "@/lib/prisma";
import type { VapeProfileData } from "./types";
import { emptyVapeProfile } from "./types";

/** Client Prisma étendu (VapeProfile — régénérer le client Prisma en production) */
interface VapeDbClient {
  vapeProfile: {
    findUnique: (args: { where: { userId: string } }) => Promise<Record<string, unknown> | null>;
    upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    delete: (args: { where: { userId: string } }) => Promise<unknown>;
    updateMany: (args: Record<string, unknown>) => Promise<unknown>;
  };
  vapeRecommendation: {
    create: (args: Record<string, unknown>) => Promise<unknown>;
    deleteMany: (args: Record<string, unknown>) => Promise<unknown>;
    findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown> & { product?: { name: string } | null }>>;
  };
  favorite: typeof prisma.favorite;
  user: typeof prisma.user;
}

const db = prisma as unknown as VapeDbClient;

function toProfileData(record: Record<string, unknown>): VapeProfileData {
  return {
    id: record.id as string,
    userId: record.userId as string,
    status: (record.status as VapeProfileData["status"]) ?? "debutant",
    cigarettesPerDay: (record.cigarettesPerDay as number | null) ?? null,
    drawPreference: (record.drawPreference as VapeProfileData["drawPreference"]) ?? null,
    preferredFlavors: (record.preferredFlavors as VapeProfileData["preferredFlavors"]) ?? [],
    avoidedFlavors: (record.avoidedFlavors as VapeProfileData["avoidedFlavors"]) ?? [],
    advisedNicotineMg: (record.advisedNicotineMg as number | null) ?? null,
    usedNicotineMg: (record.usedNicotineMg as number | null) ?? null,
    advisedProductIds: (record.advisedProductIds as string[]) ?? [],
    triedProductIds: (record.triedProductIds as string[]) ?? [],
    averageBudgetCents: (record.averageBudgetCents as number | null) ?? null,
    gdprConsent: Boolean(record.gdprConsent),
    personalizedEnabled: record.personalizedEnabled !== false,
    lastRecommendationAt: record.lastRecommendationAt
      ? new Date(record.lastRecommendationAt as string | Date).toISOString()
      : null,
  };
}

export async function getVapeProfile(userId: string): Promise<VapeProfileData | null> {
  const profile = await db.vapeProfile.findUnique({ where: { userId } });
  if (!profile) return null;
  return toProfileData(profile as unknown as Record<string, unknown>);
}

export async function upsertVapeProfile(userId: string, data: Partial<VapeProfileData>) {
  const existing = await getVapeProfile(userId);

  if (!existing && data.gdprConsent !== true) {
    throw new Error("GDPR_CONSENT_REQUIRED");
  }

  const updateData: Record<string, unknown> = {};
  const fields = [
    "status", "cigarettesPerDay", "drawPreference", "preferredFlavors", "avoidedFlavors",
    "advisedNicotineMg", "usedNicotineMg", "advisedProductIds", "triedProductIds",
    "averageBudgetCents", "gdprConsent", "personalizedEnabled", "lastRecommendationAt",
  ] as const;

  for (const key of fields) {
    if (data[key] !== undefined) {
      updateData[key] = key === "lastRecommendationAt" && data[key]
        ? new Date(data.lastRecommendationAt!)
        : data[key];
    }
  }

  const profile = await db.vapeProfile.upsert({
    where: { userId },
    update: updateData,
    create: {
      userId,
      status: data.status ?? "debutant",
      cigarettesPerDay: data.cigarettesPerDay ?? null,
      drawPreference: data.drawPreference ?? null,
      preferredFlavors: data.preferredFlavors ?? [],
      avoidedFlavors: data.avoidedFlavors ?? [],
      advisedNicotineMg: data.advisedNicotineMg ?? null,
      usedNicotineMg: data.usedNicotineMg ?? null,
      advisedProductIds: data.advisedProductIds ?? [],
      triedProductIds: data.triedProductIds ?? [],
      averageBudgetCents: data.averageBudgetCents ?? null,
      gdprConsent: data.gdprConsent ?? false,
      personalizedEnabled: data.personalizedEnabled ?? true,
    },
  });

  return toProfileData(profile as unknown as Record<string, unknown>);
}

export async function deleteVapeProfile(userId: string) {
  await db.vapeRecommendation.deleteMany({ where: { userId } });
  try {
    await db.vapeProfile.delete({ where: { userId } });
  } catch {
    // profile may not exist
  }
}

export async function addRecommendation(
  userId: string,
  productId: string | null,
  reason: string,
  score?: number,
  source = "engine"
) {
  await db.vapeRecommendation.create({
    data: { userId, productId, reason, score, source },
  });
  await db.vapeProfile.updateMany({
    where: { userId },
    data: { lastRecommendationAt: new Date() },
  });
}

export async function getRecommendationHistory(userId: string, limit = 20) {
  return db.vapeRecommendation.findMany({
    where: { userId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getProfileWithContext(userId: string) {
  const [profile, favorites, history] = await Promise.all([
    getVapeProfile(userId),
    prisma.favorite.findMany({ where: { userId }, include: { product: true } }),
    getRecommendationHistory(userId, 10),
  ]);

  return {
    profile: profile ?? emptyVapeProfile(),
    favorites: favorites.map((f) => f.product).filter(Boolean),
    history,
    hasProfile: !!profile?.gdprConsent,
  };
}
