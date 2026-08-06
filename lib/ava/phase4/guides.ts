/**
 * Accès guides / FAQ / SAV — uniquement statut VERIFIED pour le public.
 * Graceful si tables absentes (migration non appliquée).
 */

type GuideKind =
  | "STARTUP"
  | "MAINTENANCE"
  | "TROUBLESHOOTING"
  | "FAQ"
  | "VIDEO"
  | "DOCUMENT";

async function prismaSafe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function listVerifiedGuides(kind?: GuideKind) {
  const { default: prisma } = await import("@/lib/prisma");
  return prismaSafe(
    () =>
      prisma.avaGuide.findMany({
        where: { status: "VERIFIED", ...(kind ? { kind } : {}) },
        orderBy: { title: "asc" },
        include: {
          equipment: { include: { equipment: true } },
        },
      }),
    [],
  );
}

export async function getVerifiedGuideBySlug(slug: string) {
  const { default: prisma } = await import("@/lib/prisma");
  return prismaSafe(
    () =>
      prisma.avaGuide.findFirst({
        where: { slug, status: "VERIFIED" },
        include: {
          equipment: { include: { equipment: true } },
          faqEntries: { where: { status: "VERIFIED" } },
        },
      }),
    null,
  );
}

export async function listVerifiedFaq() {
  const { default: prisma } = await import("@/lib/prisma");
  return prismaSafe(
    () =>
      prisma.avaFaqEntry.findMany({
        where: { status: "VERIFIED" },
        orderBy: { updatedAt: "desc" },
      }),
    [],
  );
}

export async function listVerifiedSav(equipmentId?: string) {
  const { default: prisma } = await import("@/lib/prisma");
  return prismaSafe(
    () =>
      prisma.avaSavProcedure.findMany({
        where: {
          status: "VERIFIED",
          ...(equipmentId ? { equipmentId } : {}),
        },
        orderBy: { title: "asc" },
      }),
    [],
  );
}

export async function listGuidesForEquipment(equipmentId: string) {
  const { default: prisma } = await import("@/lib/prisma");
  return prismaSafe(
    () =>
      prisma.avaGuide.findMany({
        where: {
          status: "VERIFIED",
          equipment: { some: { equipmentId } },
        },
        orderBy: { kind: "asc" },
      }),
    [],
  );
}
