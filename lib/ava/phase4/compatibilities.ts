/**
 * Compatibilités Phase 4 — uniquement liens VERIFIED.
 * Aucune compatibilité inventée.
 */
import { isAvaPhase4Excluded } from "@/lib/ava/phase4/constants";

async function prismaSafe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function listVerifiedEquipment(kind?: string) {
  const { default: prisma } = await import("@/lib/prisma");
  return prismaSafe(
    () =>
      prisma.avaEquipmentSheet.findMany({
        where: {
          status: "VERIFIED",
          ...(kind ? { kind: kind as never } : {}),
        },
        orderBy: [{ manufacturer: "asc" }, { model: "asc" }],
      }),
    [],
  );
}

export async function getVerifiedEquipmentBySlug(slug: string) {
  const { default: prisma } = await import("@/lib/prisma");
  const sheet = await prismaSafe(
    () =>
      prisma.avaEquipmentSheet.findFirst({
        where: { slug, status: "VERIFIED" },
      }),
    null,
  );
  if (!sheet) return null;
  const excl = isAvaPhase4Excluded(`${sheet.manufacturer} ${sheet.model}`);
  if (excl.excluded) return null;
  return sheet;
}

export async function listVerifiedCompatibilities(equipmentId: string) {
  const { default: prisma } = await import("@/lib/prisma");
  return prismaSafe(
    () =>
      prisma.avaCompatibilityLink.findMany({
        where: {
          status: "VERIFIED",
          OR: [{ fromEquipmentId: equipmentId }, { toEquipmentId: equipmentId }],
        },
        include: {
          fromEquipment: true,
          toEquipment: true,
        },
        orderBy: { relationType: "asc" },
      }),
    [],
  );
}

/** Atomes pour le moteur de raisonnement (symptômes connus VERIFIED). */
export async function loadVerifiedKnowledgeAtoms() {
  const sheets = await listVerifiedEquipment();
  return sheets
    .filter((s) => !isAvaPhase4Excluded(`${s.manufacturer} ${s.model}`).excluded)
    .filter((s) => (s.knownSymptoms?.length || 0) > 0)
    .map((s) => ({
      id: s.id,
      title: `${s.manufacturer} ${s.model}`,
      symptoms: s.knownSymptoms || [],
      solutionHint: s.summary,
      sourceNote: s.sourceNote,
      equipmentLabel: `${s.manufacturer} ${s.model}`,
    }));
}
