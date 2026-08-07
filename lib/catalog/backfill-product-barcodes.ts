/**
 * Backfill Product.barcode — attributions univoques uniquement.
 * Sources : map SumUp Item id → EAN, et variante active unique.
 */
import prisma from "@/lib/prisma";

export type BarcodeBackfillSource = "sumup_item_id" | "variant_unique";

export type BarcodeBackfillPlan = {
  productId: string;
  name: string;
  sku: string | null;
  sumupProductId: string | null;
  barcode: string;
  source: BarcodeBackfillSource;
};

export type BarcodeBackfillResult = {
  apply: boolean;
  productsTotal: number;
  withBarcodeBefore: number;
  planned: number;
  bySource: Record<BarcodeBackfillSource, number>;
  applied: number;
  skipped: number;
  stillMissingEstimate: number;
  samplePlans: BarcodeBackfillPlan[];
  sampleSkipped: Array<{ productId: string; name: string; reason: string }>;
};

export function normalizeEan(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

export async function runProductBarcodeBackfill(opts: {
  apply: boolean;
  sumupItemBarcodes: Record<string, string>;
}): Promise<BarcodeBackfillResult> {
  const byItemId = new Map<string, string>();
  const eanOwners = new Map<string, Set<string>>();

  for (const [itemId, rawEan] of Object.entries(opts.sumupItemBarcodes)) {
    const id = String(itemId || "").trim();
    const ean = normalizeEan(rawEan);
    if (!id || !ean) continue;
    byItemId.set(id, ean);
    if (!eanOwners.has(ean)) eanOwners.set(ean, new Set());
    eanOwners.get(ean)!.add(id);
  }

  const ambiguousEans = new Set(
    [...eanOwners.entries()].filter(([, ids]) => ids.size > 1).map(([ean]) => ean)
  );

  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      sumupProductId: true,
      variants: {
        where: { active: true },
        select: { id: true, barcode: true },
      },
    },
  });

  const occupied = new Map<string, string>();
  for (const p of products) {
    const e = normalizeEan(p.barcode);
    if (e) occupied.set(e, p.id);
  }

  const plans: BarcodeBackfillPlan[] = [];
  const skipped: Array<{ productId: string; name: string; reason: string }> = [];

  for (const p of products) {
    if (normalizeEan(p.barcode)) continue;
    const sid = (p.sumupProductId || "").trim();
    if (!sid) continue;
    const ean = byItemId.get(sid);
    if (!ean) {
      skipped.push({ productId: p.id, name: p.name, reason: "sumup_id_sans_ean_map" });
      continue;
    }
    if (ambiguousEans.has(ean)) {
      skipped.push({ productId: p.id, name: p.name, reason: `ean_map_ambigu:${ean}` });
      continue;
    }
    const owner = occupied.get(ean);
    if (owner && owner !== p.id) {
      skipped.push({
        productId: p.id,
        name: p.name,
        reason: `ean_deja_utilise_par:${owner}:${ean}`,
      });
      continue;
    }
    plans.push({
      productId: p.id,
      name: p.name,
      sku: p.sku,
      sumupProductId: sid,
      barcode: ean,
      source: "sumup_item_id",
    });
    occupied.set(ean, p.id);
  }

  for (const p of products) {
    if (normalizeEan(p.barcode)) continue;
    if (plans.some((x) => x.productId === p.id)) continue;
    const variantEans = [
      ...new Set(
        p.variants
          .map((v) => normalizeEan(v.barcode))
          .filter((x): x is string => Boolean(x))
      ),
    ];
    if (variantEans.length !== 1) {
      if (variantEans.length > 1) {
        skipped.push({
          productId: p.id,
          name: p.name,
          reason: `variantes_ean_multiples:${variantEans.join(",")}`,
        });
      }
      continue;
    }
    const ean = variantEans[0]!;
    const owner = occupied.get(ean);
    if (owner && owner !== p.id) {
      skipped.push({
        productId: p.id,
        name: p.name,
        reason: `ean_variante_clash:${owner}:${ean}`,
      });
      continue;
    }
    plans.push({
      productId: p.id,
      name: p.name,
      sku: p.sku,
      sumupProductId: p.sumupProductId,
      barcode: ean,
      source: "variant_unique",
    });
    occupied.set(ean, p.id);
  }

  let applied = 0;
  if (opts.apply && plans.length) {
    for (const plan of plans) {
      const current = await prisma.product.findUnique({
        where: { id: plan.productId },
        select: { barcode: true },
      });
      if (normalizeEan(current?.barcode)) continue;
      const clash = await prisma.product.findFirst({
        where: { barcode: plan.barcode, id: { not: plan.productId } },
        select: { id: true },
      });
      if (clash) continue;
      await prisma.product.update({
        where: { id: plan.productId },
        data: { barcode: plan.barcode },
      });
      applied += 1;
    }
  }

  const withBarcodeBefore = products.filter((p) => normalizeEan(p.barcode)).length;
  const stillMissingEstimate = products.filter((p) => {
    if (normalizeEan(p.barcode)) return false;
    return !plans.some((x) => x.productId === p.id);
  }).length;

  return {
    apply: opts.apply,
    productsTotal: products.length,
    withBarcodeBefore,
    planned: plans.length,
    bySource: {
      sumup_item_id: plans.filter((p) => p.source === "sumup_item_id").length,
      variant_unique: plans.filter((p) => p.source === "variant_unique").length,
    },
    applied,
    skipped: skipped.length,
    stillMissingEstimate,
    samplePlans: plans.slice(0, 40),
    sampleSkipped: skipped.slice(0, 40),
  };
}
