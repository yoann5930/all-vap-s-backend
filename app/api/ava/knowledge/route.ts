import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import {
  getVerifiedEquipmentBySlug,
  listVerifiedCompatibilities,
  listVerifiedEquipment,
  loadVerifiedKnowledgeAtoms,
} from "@/lib/ava/phase4/compatibilities";
import {
  getVerifiedGuideBySlug,
  listGuidesForEquipment,
  listVerifiedFaq,
  listVerifiedGuides,
  listVerifiedSav,
} from "@/lib/ava/phase4/guides";
import { runReasoningEngine } from "@/lib/ava/phase4/reasoning-engine";
import { AVA_PHASE4_STATUS } from "@/lib/ava/phase4/constants";

/**
 * Lecture publique Phase 4 — uniquement données VERIFIED.
 * Sans migration / sans données → listes vides (pas d'invention).
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const action = sp.get("action") || "status";

    if (action === "status") {
      return jsonResponse({
        phase: 4,
        officialStatus: AVA_PHASE4_STATUS.official,
        infrastructureReady: true,
        verifiedOnly: true,
      });
    }

    if (action === "equipment") {
      const slug = sp.get("slug");
      if (slug) {
        const sheet = await getVerifiedEquipmentBySlug(slug);
        if (!sheet) return jsonResponse({ equipment: null });
        const [compat, guides] = await Promise.all([
          listVerifiedCompatibilities(sheet.id),
          listGuidesForEquipment(sheet.id),
        ]);
        return jsonResponse({ equipment: sheet, compatibilities: compat, guides });
      }
      const kind = sp.get("kind") || undefined;
      return jsonResponse({ equipment: await listVerifiedEquipment(kind) });
    }

    if (action === "guides") {
      const slug = sp.get("slug");
      if (slug) return jsonResponse({ guide: await getVerifiedGuideBySlug(slug) });
      const kind = sp.get("kind") as never;
      return jsonResponse({ guides: await listVerifiedGuides(kind || undefined) });
    }

    if (action === "faq") {
      return jsonResponse({ faq: await listVerifiedFaq() });
    }

    if (action === "sav") {
      return jsonResponse({
        procedures: await listVerifiedSav(sp.get("equipmentId") || undefined),
      });
    }

    return jsonResponse({ error: "action inconnue" }, 400);
  } catch (e) {
    return handleApiError(e);
  }
}

const reasonSchema = z.object({
  symptomsText: z.string().min(1).max(4000),
  knownEquipment: z
    .object({
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      kind: z.string().optional(),
    })
    .optional()
    .nullable(),
  clientContext: z.record(z.unknown()).optional().nullable(),
  persist: z.boolean().optional(),
  userId: z.string().optional(),
});

/** Raisonnement — hypothèses uniquement depuis connaissances VERIFIED. */
export async function POST(req: NextRequest) {
  try {
    const body = reasonSchema.parse(await req.json());
    const atoms = await loadVerifiedKnowledgeAtoms();
    const result = runReasoningEngine(
      {
        symptomsText: body.symptomsText,
        knownEquipment: body.knownEquipment,
        clientContext: body.clientContext,
      },
      atoms,
    );

    if (body.persist) {
      try {
        const { default: prisma } = await import("@/lib/prisma");
        await prisma.avaReasoningSession.create({
          data: {
            userId: body.userId,
            symptomsText: body.symptomsText,
            contextJson: {
              knownEquipment: body.knownEquipment ?? null,
              clientContext: body.clientContext ?? null,
            } as Prisma.InputJsonValue,
            hypothesesJson: result.hypotheses as unknown as Prisma.InputJsonValue,
            topConfidence: result.topConfidence,
            needsMoreInfo: result.needsMoreInfo,
            explanation: result.explanation,
            complementaryAsk: result.complementaryAsk,
          },
        });
      } catch {
        /* migration non appliquée */
      }
    }

    return jsonResponse({
      officialStatus: AVA_PHASE4_STATUS.official,
      result,
      verifiedAtomsCount: atoms.length,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
