/**
 * Tests flux inventaire : conditionnement + multi-EAN + anti-fusion.
 * Utilise la DB si DATABASE_URL est une vraie URL Postgres (jamais [SENSITIVE]).
 * Usage: npx tsx scripts/test-inventory-packaging-flow.ts
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  computeTotalUnits,
  formatPackagedStockLabel,
  isPackagedHardwareCategory,
  normalizeUnitsPerBox,
  UNITS_PER_BOX_ALLOWED,
} from "../lib/inventory/packaging";
import {
  attachBarcodeToProduct,
  barcodeCandidates,
} from "../lib/inventory/product-barcodes";
import { resolveProductByScannedBarcode } from "../lib/inventory/resolve-barcode";
import {
  parseNicotineMgFromText,
  parseVolumeMlFromText,
  suggestProductForUnknownBarcode,
} from "../lib/inventory/barcode-alias-suggest";

function id() {
  return randomBytes(12).toString("hex");
}

function dbUrlUsable(): string | null {
  const raw = (process.env.DATABASE_URL || "").trim();
  if (!raw || raw === "[SENSITIVE]" || raw === "SENSITIVE") return null;
  if (!/^postgres(ql)?:\/\//i.test(raw)) return null;
  return raw;
}

assert.deepEqual([...UNITS_PER_BOX_ALLOWED], [1, 2, 3, 4, 5]);
for (const n of [1, 3, 5] as const) {
  assert.equal(normalizeUnitsPerBox(n), n);
  assert.equal(
    computeTotalUnits({ fullBoxes: 2, unitsPerBox: n, looseUnits: 0 }),
    2 * n
  );
}
assert.equal(
  computeTotalUnits({ fullBoxes: 6, unitsPerBox: 5, looseUnits: 2 }),
  32
);
assert.equal(
  computeTotalUnits({ fullBoxes: 1, unitsPerBox: 2, looseUnits: 1 }),
  3
);
assert.equal(
  formatPackagedStockLabel({ totalUnits: 32, unitsPerBox: 5 }),
  "Stock : 6 boîtes × 5 + 2 unités = 32 unités"
);
assert.ok(
  isPackagedHardwareCategory({ name: "Résistance PnP", category: "resistances" })
);
assert.ok(
  isPackagedHardwareCategory({ name: "Réservoir Zeus", category: "materiel" })
);
assert.equal(
  isPackagedHardwareCategory({
    name: "Ice Cool Ananas 50ml",
    category: "e-liquides",
  }),
  false
);
assert.equal(parseVolumeMlFromText("Ananas Fraise Pêche 50 ml"), 50);
assert.equal(parseVolumeMlFromText("Ananas Fraise Pêche 100 ml"), 100);
assert.equal(parseNicotineMgFromText("3 mg"), 3);
assert.ok(barcodeCandidates("0123456789012").length >= 1);
console.log("OK unit — packaging + labels + détection catégorie");

async function runDbFlow() {
  const url = dbUrlUsable();
  if (!url) {
    console.log(
      "SKIP db — DATABASE_URL absente ou placeholder dans cet environnement"
    );
    return { skipped: true as const };
  }

  process.env.DATABASE_URL = url;
  const prisma = new PrismaClient();
  const suffix = id().slice(0, 8);
  const eanA = `200${suffix}00001`.replace(/\D/g, "").padEnd(13, "1").slice(0, 13);
  const eanB = `200${suffix}00002`.replace(/\D/g, "").padEnd(13, "2").slice(0, 13);
  const eanUnknown = `200${suffix}00003`
    .replace(/\D/g, "")
    .padEnd(13, "3")
    .slice(0, 13);

  let productId: string | null = null;
  let product50Id: string | null = null;
  let product100Id: string | null = null;

  try {
    const product = await prisma.product.create({
      data: {
        id: id(),
        name: `TEST Résistance Pack Flow ${suffix}`,
        slug: `test-res-flow-${suffix}`,
        category: "resistances",
        productFamily: "resistances",
        brand: "TestBrand",
        range: "TestRange",
        priceCents: 410,
        unitsPerBox: 5,
        barcode: eanA,
        isActive: true,
      },
    });
    productId = product.id;

    assert.equal(
      (
        await attachBarcodeToProduct({
          productId: product.id,
          barcode: eanA,
          role: "PRIMARY",
          label: "ancien packaging",
        })
      ).ok,
      true
    );
    assert.equal(
      (
        await attachBarcodeToProduct({
          productId: product.id,
          barcode: eanB,
          role: "ALIAS",
          label: "nouveau packaging",
        })
      ).ok,
      true
    );

    const hitA = await resolveProductByScannedBarcode(eanA);
    const hitB = await resolveProductByScannedBarcode(eanB);
    assert.ok(hitA && hitB);
    assert.equal(hitA!.productId, product.id);
    assert.equal(hitB!.productId, product.id);

    const total = computeTotalUnits({
      fullBoxes: 4,
      unitsPerBox: 5,
      looseUnits: 2,
    });
    assert.equal(total, 22);

    const p50 = await prisma.product.create({
      data: {
        id: id(),
        name: `TEST Mexican Cartel Ananas Fraise Peche 50ml ${suffix}`,
        slug: `test-mx-50-${suffix}`,
        category: "e-liquides",
        brand: "Mexican Cartel",
        volumeMl: 50,
        priceCents: 1990,
        barcode: `210${suffix}00004`.replace(/\D/g, "").padEnd(13, "4").slice(0, 13),
        isActive: true,
      },
    });
    product50Id = p50.id;

    const p100 = await prisma.product.create({
      data: {
        id: id(),
        name: `TEST Mexican Cartel Ananas Fraise Peche 100ml ${suffix}`,
        slug: `test-mx-100-${suffix}`,
        category: "e-liquides",
        brand: "Mexican Cartel",
        volumeMl: 100,
        priceCents: 2990,
        barcode: `210${suffix}00005`.replace(/\D/g, "").padEnd(13, "5").slice(0, 13),
        isActive: true,
      },
    });
    product100Id = p100.id;

    const suggest50 = await suggestProductForUnknownBarcode({
      barcode: eanUnknown,
      nameHint: `Mexican Cartel Ananas Fraise Peche 50 ml ${suffix}`,
      brandHint: "Mexican Cartel",
      volumeMlHint: 50,
    });
    if (suggest50) {
      assert.notEqual(suggest50.productId, p100.id);
      assert.equal(suggest50.volumeMl, 50);
    }

    const suggest100 = await suggestProductForUnknownBarcode({
      barcode: eanUnknown,
      nameHint: `Mexican Cartel Ananas Fraise Peche 100 ml ${suffix}`,
      brandHint: "Mexican Cartel",
      volumeMlHint: 100,
    });
    if (suggest100) {
      assert.notEqual(suggest100.productId, p50.id);
    }

    console.log(
      "OK db — multi-EAN même produit + conditionnement 22 u + anti-fusion 50/100"
    );
    return { skipped: false as const };
  } finally {
    try {
      if (productId) {
        await prisma.productBarcode.deleteMany({ where: { productId } });
        await prisma.catalogEanMap
          .deleteMany({ where: { productId } })
          .catch(() => undefined);
        await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
      }
      if (product50Id) {
        await prisma.product.delete({ where: { id: product50Id } }).catch(() => undefined);
      }
      if (product100Id) {
        await prisma.product
          .delete({ where: { id: product100Id } })
          .catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
    await prisma.$disconnect();
  }
}

runDbFlow()
  .then((r) => {
    console.log(
      r.skipped
        ? "DONE — unitaires OK ; flux DB non exécuté ici (URL non dispo agent)"
        : "DONE — unitaires + flux DB OK"
    );
  })
  .catch((e) => {
    console.error("FAIL", e instanceof Error ? e.message : e);
    process.exit(1);
  });
