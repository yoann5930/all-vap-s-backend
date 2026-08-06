/**
 * Audit + écriture admin Phase 4 — toute mutation historisée.
 * N'écrit jamais prix / stocks / produits catalogue.
 */
import type { Prisma } from "@prisma/client";
import { isAvaPhase4Excluded } from "@/lib/ava/phase4/constants";

export type KnowledgeEntityType =
  | "equipment"
  | "compatibility"
  | "guide"
  | "faq"
  | "sav";

export async function writeKnowledgeAudit(params: {
  entityType: KnowledgeEntityType;
  entityId: string;
  action: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  actorUserId?: string | null;
}) {
  try {
    const { default: prisma } = await import("@/lib/prisma");
    await prisma.avaKnowledgeAuditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        beforeJson: (params.beforeJson ?? undefined) as Prisma.InputJsonValue | undefined,
        afterJson: (params.afterJson ?? undefined) as Prisma.InputJsonValue | undefined,
        actorUserId: params.actorUserId || undefined,
      },
    });
  } catch {
    // Tables absentes tant que la migration n'est pas appliquée
  }
}

export async function listKnowledgeAudit(limit = 100) {
  try {
    const { default: prisma } = await import("@/lib/prisma");
    return await prisma.avaKnowledgeAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  } catch {
    return [];
  }
}

export function assertNotExcludedBrand(text: string): void {
  const excl = isAvaPhase4Excluded(text);
  if (excl.excluded) {
    throw new Error(excl.reason || "Marque / produit exclu d'A.V.A.");
  }
}

export async function createEquipmentDraft(input: {
  kind: string;
  manufacturer: string;
  model: string;
  slug: string;
  summary?: string;
  knownSymptoms?: string[];
  sourceNote?: string;
  actorUserId?: string;
}) {
  assertNotExcludedBrand(`${input.manufacturer} ${input.model}`);
  const { default: prisma } = await import("@/lib/prisma");
  const created = await prisma.avaEquipmentSheet.create({
    data: {
      kind: input.kind as never,
      manufacturer: input.manufacturer.trim(),
      model: input.model.trim(),
      slug: input.slug.trim(),
      summary: input.summary,
      knownSymptoms: input.knownSymptoms || [],
      sourceNote: input.sourceNote,
      status: "DRAFT",
    },
  });
  await writeKnowledgeAudit({
    entityType: "equipment",
    entityId: created.id,
    action: "create",
    afterJson: created,
    actorUserId: input.actorUserId,
  });
  return created;
}

export async function createCompatibilityDraft(input: {
  fromEquipmentId: string;
  toEquipmentId: string;
  relationType: string;
  notes?: string;
  sourceNote?: string;
  actorUserId?: string;
}) {
  const { default: prisma } = await import("@/lib/prisma");
  const [from, to] = await Promise.all([
    prisma.avaEquipmentSheet.findUnique({ where: { id: input.fromEquipmentId } }),
    prisma.avaEquipmentSheet.findUnique({ where: { id: input.toEquipmentId } }),
  ]);
  if (!from || !to) throw new Error("Fiches matériel introuvables");
  assertNotExcludedBrand(`${from.manufacturer} ${from.model} ${to.manufacturer} ${to.model}`);

  const created = await prisma.avaCompatibilityLink.create({
    data: {
      fromEquipmentId: input.fromEquipmentId,
      toEquipmentId: input.toEquipmentId,
      relationType: input.relationType.trim(),
      notes: input.notes,
      sourceNote: input.sourceNote,
      status: "DRAFT",
    },
  });
  await writeKnowledgeAudit({
    entityType: "compatibility",
    entityId: created.id,
    action: "create",
    afterJson: created,
    actorUserId: input.actorUserId,
  });
  return created;
}

export async function createGuideDraft(input: {
  kind: string;
  title: string;
  slug: string;
  summary?: string;
  bodyMarkdown?: string;
  mediaUrl?: string;
  sourceNote?: string;
  actorUserId?: string;
}) {
  const { default: prisma } = await import("@/lib/prisma");
  const created = await prisma.avaGuide.create({
    data: {
      kind: input.kind as never,
      title: input.title.trim(),
      slug: input.slug.trim(),
      summary: input.summary,
      bodyMarkdown: input.bodyMarkdown,
      mediaUrl: input.mediaUrl,
      sourceNote: input.sourceNote,
      status: "DRAFT",
    },
  });
  await writeKnowledgeAudit({
    entityType: "guide",
    entityId: created.id,
    action: "create",
    afterJson: created,
    actorUserId: input.actorUserId,
  });
  return created;
}

export async function createFaqDraft(input: {
  question: string;
  answer: string;
  guideId?: string;
  sourceNote?: string;
  actorUserId?: string;
}) {
  const { default: prisma } = await import("@/lib/prisma");
  const created = await prisma.avaFaqEntry.create({
    data: {
      question: input.question.trim(),
      answer: input.answer.trim(),
      guideId: input.guideId,
      sourceNote: input.sourceNote,
      status: "DRAFT",
    },
  });
  await writeKnowledgeAudit({
    entityType: "faq",
    entityId: created.id,
    action: "create",
    afterJson: created,
    actorUserId: input.actorUserId,
  });
  return created;
}

export async function createSavDraft(input: {
  title: string;
  slug: string;
  stepsJson?: unknown;
  equipmentId?: string;
  sourceNote?: string;
  actorUserId?: string;
}) {
  const { default: prisma } = await import("@/lib/prisma");
  const created = await prisma.avaSavProcedure.create({
    data: {
      title: input.title.trim(),
      slug: input.slug.trim(),
      stepsJson: (input.stepsJson ?? undefined) as never,
      equipmentId: input.equipmentId,
      sourceNote: input.sourceNote,
      status: "DRAFT",
    },
  });
  await writeKnowledgeAudit({
    entityType: "sav",
    entityId: created.id,
    action: "create",
    afterJson: created,
    actorUserId: input.actorUserId,
  });
  return created;
}
