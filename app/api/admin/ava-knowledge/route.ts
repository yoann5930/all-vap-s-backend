import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireAuth } from "@/lib/jwt";
import {
  createCompatibilityDraft,
  createEquipmentDraft,
  createFaqDraft,
  createGuideDraft,
  createSavDraft,
  listKnowledgeAudit,
} from "@/lib/ava/phase4/admin-knowledge";

function requireAdmin(auth: { role?: string }) {
  const role = auth.role || "";
  if (role !== "ADMIN" && role !== "STAFF") {
    throw new Error("FORBIDDEN");
  }
}

export async function GET() {
  try {
    const auth = await requireAuth();
    requireAdmin(auth as { role?: string });
    const { default: prisma } = await import("@/lib/prisma");

    let equipment: unknown[] = [];
    let guides: unknown[] = [];
    let faq: unknown[] = [];
    let sav: unknown[] = [];
    let compat: unknown[] = [];
    try {
      [equipment, guides, faq, sav, compat] = await Promise.all([
        prisma.avaEquipmentSheet.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
        prisma.avaGuide.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
        prisma.avaFaqEntry.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
        prisma.avaSavProcedure.findMany({ orderBy: { updatedAt: "desc" }, take: 200 }),
        prisma.avaCompatibilityLink.findMany({
          orderBy: { updatedAt: "desc" },
          take: 200,
          include: { fromEquipment: true, toEquipment: true },
        }),
      ]);
    } catch {
      /* tables absentes */
    }

    const audit = await listKnowledgeAudit(100);
    return jsonResponse({
      equipment,
      guides,
      faq,
      sav,
      compatibilities: compat,
      audit,
      migrationApplied: equipment.length > 0 || audit.length >= 0,
      note: "Statuts DRAFT par défaut — passer en VERIFIED uniquement après validation métier.",
    });
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return jsonResponse({ error: "Accès refusé" }, 403);
    }
    return handleApiError(e);
  }
}

const postSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("equipment"),
    kind: z.string(),
    manufacturer: z.string().min(1),
    model: z.string().min(1),
    slug: z.string().min(1),
    summary: z.string().optional(),
    knownSymptoms: z.array(z.string()).optional(),
    sourceNote: z.string().optional(),
  }),
  z.object({
    entity: z.literal("compatibility"),
    fromEquipmentId: z.string(),
    toEquipmentId: z.string(),
    relationType: z.string().min(1),
    notes: z.string().optional(),
    sourceNote: z.string().optional(),
  }),
  z.object({
    entity: z.literal("guide"),
    kind: z.string(),
    title: z.string().min(1),
    slug: z.string().min(1),
    summary: z.string().optional(),
    bodyMarkdown: z.string().optional(),
    mediaUrl: z.string().optional(),
    sourceNote: z.string().optional(),
  }),
  z.object({
    entity: z.literal("faq"),
    question: z.string().min(1),
    answer: z.string().min(1),
    guideId: z.string().optional(),
    sourceNote: z.string().optional(),
  }),
  z.object({
    entity: z.literal("sav"),
    title: z.string().min(1),
    slug: z.string().min(1),
    stepsJson: z.unknown().optional(),
    equipmentId: z.string().optional(),
    sourceNote: z.string().optional(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    requireAdmin(auth as { role?: string });
    const body = postSchema.parse(await req.json());
    const actorUserId = auth.userId;

    if (body.entity === "equipment") {
      const created = await createEquipmentDraft({ ...body, actorUserId });
      return jsonResponse({ ok: true, created }, 201);
    }
    if (body.entity === "compatibility") {
      const created = await createCompatibilityDraft({ ...body, actorUserId });
      return jsonResponse({ ok: true, created }, 201);
    }
    if (body.entity === "guide") {
      const created = await createGuideDraft({ ...body, actorUserId });
      return jsonResponse({ ok: true, created }, 201);
    }
    if (body.entity === "faq") {
      const created = await createFaqDraft({ ...body, actorUserId });
      return jsonResponse({ ok: true, created }, 201);
    }
    const created = await createSavDraft({ ...body, actorUserId });
    return jsonResponse({ ok: true, created }, 201);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return jsonResponse({ error: "Accès refusé" }, 403);
    }
    if (e instanceof Error && /exclu|JNR|puff|jetable/i.test(e.message)) {
      return jsonResponse({ error: e.message }, 400);
    }
    return handleApiError(e);
  }
}
