/**
 * Smoke test moteur classification (pas de stocks).
 * npx tsx scripts/test-classification-engine-smoke.ts
 */
import prisma from "../lib/prisma";
import { classifyProductById } from "../lib/catalog/classification-engine";

async function main() {
  const known = await prisma.product.findFirst({
    where: {
      OR: [
        { name: { contains: "Ice Cool", mode: "insensitive" } },
        { sumupName: { contains: "Ice Cool", mode: "insensitive" } },
      ],
      barcode: { not: null },
    },
    select: { id: true, name: true, barcode: true, manufacturerId: true, rangeId: true },
  });

  if (!known) {
    console.log(JSON.stringify({ ok: false, error: "no_ice_cool_product" }));
    return;
  }

  const dry = await classifyProductById({
    productId: known.id,
    source: "audit_safe",
    barcodeHint: known.barcode,
    apply: false,
  });

  const applied = await classifyProductById({
    productId: known.id,
    source: "inventory_scan",
    barcodeHint: known.barcode,
    apply: true,
  });

  // Ambigu Savourea
  const amb = await prisma.product.findFirst({
    where: {
      OR: [
        { name: { contains: "Savourea", mode: "insensitive" } },
        { name: { contains: "Fruizee", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true },
  });
  const ambRes = amb
    ? await classifyProductById({
        productId: amb.id,
        source: "audit_safe",
        apply: false,
      })
    : null;

  console.log(
    JSON.stringify(
      {
        ok: true,
        stocksTouched: false,
        known: { id: known.id, name: known.name, dry, applied },
        ambiguous: ambRes
          ? {
              name: amb?.name,
              confidence: ambRes.confidence,
              applied: ambRes.applied,
              reason: ambRes.reason,
            }
          : null,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
