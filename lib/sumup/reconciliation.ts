/**
 * Rapprochement ventes web → SumUp.
 * SumUp n'a pas d'API officielle d'écriture stock → file PENDING uniquement.
 * Ne jamais appeler d'endpoint inventé / reverse engineering.
 */
import prisma from "@/lib/prisma";
import { getSumUpSyncConfig } from "@/lib/sumup/config";

export async function enqueueWebSaleReconciliation(params: {
  orderId: string;
  lines: Array<{
    productId: string;
    variantId?: string | null;
    quantity: number;
    name?: string;
  }>;
}) {
  const cfg = getSumUpSyncConfig();
  if (cfg.stockWriteMode !== "disabled") {
    // Mode futur partenaire officiel — pour l'instant on file quand même
  }

  const idempotencyKey = `web_sale:${params.orderId}`;
  try {
    await prisma.reconciliationTask.upsert({
      where: { idempotencyKey },
      create: {
        kind: "web_sale_to_sumup",
        status: "PENDING",
        externalId: params.orderId,
        idempotencyKey,
        payloadJson: JSON.stringify({
          orderId: params.orderId,
          lines: params.lines,
          note: "À saisir / rapprocher manuellement dans SumUp — pas d'API stock write officielle.",
          stockWriteMode: cfg.stockWriteMode,
        }),
      },
      update: {
        // idempotent : ne pas réouvrir si déjà résolu
      },
    });
  } catch {
    // Client Prisma pas encore régénéré → fallback SQL
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ReconciliationTask" (id, kind, status, "externalId", "idempotencyKey", "payloadJson", "createdAt", "updatedAt")
         VALUES ($1, 'web_sale_to_sumup', 'PENDING', $2, $3, $4, NOW(), NOW())
         ON CONFLICT ("idempotencyKey") DO NOTHING`,
        `rec_${params.orderId}`,
        params.orderId,
        idempotencyKey,
        JSON.stringify({
          orderId: params.orderId,
          lines: params.lines,
          note: "À rapprocher manuellement dans SumUp.",
          stockWriteMode: cfg.stockWriteMode,
        })
      );
    } catch {
      /* table absente tant que db push non fait */
    }
  }
}
