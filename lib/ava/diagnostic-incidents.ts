/**
 * Incidents diagnostic A.V.A. — pas de facture / motif admin.
 */
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  findProblemsBySymptoms,
  isExcludedBrandOrProduct,
} from "@/lib/ava/problems-knowledge";
import { checkHardwareSafety } from "@/lib/ava/hardware-safety";

export type CreateIncidentInput = {
  userId?: string | null;
  productId?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  symptomFreeText: string;
  clientMessage?: string | null;
  mediaIds?: string[];
};

export async function createDiagnosticIncident(input: CreateIncidentInput) {
  const blob = [
    input.symptomFreeText,
    input.clientMessage,
    input.manufacturer,
    input.model,
  ]
    .filter(Boolean)
    .join(" ");

  const excl = isExcludedBrandOrProduct(blob);
  if (excl.excluded) {
    return {
      ok: false as const,
      error: excl.reason,
      excluded: true as const,
    };
  }

  const safety = checkHardwareSafety(blob);
  const matched = findProblemsBySymptoms(blob);
  const riskLevel = safety.danger
    ? "critique"
    : matched[0]?.niveau_risque || "faible";

  const recommendations = safety.danger
    ? safety.message ||
      "Arrêt immédiat recommandé. Passez en boutique All Vap's."
    : matched[0]?.controles_sans_risque?.slice(0, 4).join(" ") ||
      "Décrivez le modèle inscrit sur l'appareil ; des contrôles sans risque seront proposés.";

  const incident = await prisma.avaDiagnosticIncident.create({
    data: {
      userId: input.userId || null,
      productId: input.productId || null,
      manufacturer: input.manufacturer || null,
      model: input.model || null,
      symptomFreeText: input.symptomFreeText.slice(0, 2000),
      clientMessage: input.clientMessage?.slice(0, 4000) || null,
      mediaIds: input.mediaIds || [],
      analysisJson: {
        matchedProblemIds: matched.map((m) => m.probleme_id),
        safetyDanger: Boolean(safety.danger),
        validation: matched.map((m) => m.statut_validation),
      } as Prisma.InputJsonValue,
      riskLevel: String(riskLevel),
      recommendations,
      status: safety.danger ? "transmis_boutique" : "analyse",
    },
  });

  return { ok: true as const, incident, excluded: false as const };
}

export async function listIncidentsForAdmin(limit = 50) {
  return prisma.avaDiagnosticIncident.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function updateIncidentStatus(
  id: string,
  data: {
    status?: string;
    manufacturer?: string;
    model?: string;
    knowledgePromoted?: boolean;
    recommendations?: string;
  },
) {
  return prisma.avaDiagnosticIncident.update({
    where: { id },
    data: {
      status: data.status,
      manufacturer: data.manufacturer,
      model: data.model,
      knowledgePromoted: data.knowledgePromoted,
      recommendations: data.recommendations,
    },
  });
}
