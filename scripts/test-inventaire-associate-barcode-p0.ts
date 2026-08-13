/**
 * P0#1 — Vérifie le contrat auth + rate-limit du POST associate barcode.
 * Ne touche pas la prod ; teste les signatures et le flux attach en local si DB OK.
 *
 * npx tsx scripts/test-inventaire-associate-barcode-p0.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkRateLimit } from "../lib/rate-limit";
import { barcodeCandidates } from "../lib/inventory/product-barcodes";

// 1) Le source POST ne doit plus utiliser le faux contrat { ok, response, user }
const src = readFileSync("app/api/inventaire/lookup/route.ts", "utf8");
const postBlock = src.slice(src.indexOf("export async function POST"));
assert.ok(postBlock.includes("export async function POST"), "POST manquant");
assert.equal(
  /const auth = await requireInventoryAuth\(request\)/.test(postBlock),
  false,
  "POST ne doit plus appeler requireInventoryAuth(request)"
);
assert.equal(
  /if \(!auth\.ok\) return auth\.response/.test(postBlock),
  false,
  "POST ne doit plus tester auth.ok"
);
assert.ok(
  /const user = await requireInventoryAuth\(\)/.test(postBlock),
  "POST doit utiliser const user = await requireInventoryAuth()"
);
assert.equal(
  /checkRateLimit\([^)]+,\s*\{/.test(postBlock),
  false,
  "POST ne doit plus passer un objet options à checkRateLimit"
);
assert.ok(
  /checkRateLimit\(\s*`inventaire:lookup-post:/.test(postBlock),
  "POST doit rate-limiter avec (key, limit, windowMs)"
);

// 2) Signature rate-limit réelle
const ok = checkRateLimit("test-p0-associate", 2, 60_000);
assert.equal(ok.ok, true);
const ok2 = checkRateLimit("test-p0-associate", 2, 60_000);
assert.equal(ok2.ok, true);
const blocked = checkRateLimit("test-p0-associate", 2, 60_000);
assert.equal(blocked.ok, false);

// 3) Candidats EAN (prérequis resolve après association)
assert.ok(barcodeCandidates("0123456789012").length >= 1);

console.log("OK P0#1 — contrat POST associate_barcode corrigé (auth + rate-limit)");

async function optionalDbAttachRoundtrip() {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url || url === "[SENSITIVE]" || !/^postgres/i.test(url)) {
    console.log("SKIP db attach — DATABASE_URL non dispo dans cet environnement");
    return;
  }
  const { randomBytes } = await import("node:crypto");
  const { PrismaClient } = await import("@prisma/client");
  const { attachBarcodeToProduct } = await import("../lib/inventory/product-barcodes");
  const { resolveProductByScannedBarcode } = await import(
    "../lib/inventory/resolve-barcode"
  );

  process.env.DATABASE_URL = url;
  const prisma = new PrismaClient();
  const suffix = randomBytes(4).toString("hex");
  const eanPrimary = `299${suffix}00001`.replace(/\D/g, "").padEnd(13, "1").slice(0, 13);
  const eanAlias = `299${suffix}00002`.replace(/\D/g, "").padEnd(13, "2").slice(0, 13);
  let productId: string | null = null;

  try {
    const product = await prisma.product.create({
      data: {
        id: randomBytes(12).toString("hex"),
        name: `TEST P0 Associate ${suffix}`,
        slug: `test-p0-assoc-${suffix}`,
        category: "e-liquides",
        priceCents: 1990,
        barcode: eanPrimary,
        isActive: true,
      },
    });
    productId = product.id;

    const primary = await attachBarcodeToProduct({
      productId: product.id,
      barcode: eanPrimary,
      role: "PRIMARY",
      label: "ancien packaging",
    });
    assert.equal(primary.ok, true);

    const alias = await attachBarcodeToProduct({
      productId: product.id,
      barcode: eanAlias,
      role: "ALIAS",
      label: "nouveau packaging",
    });
    assert.equal(alias.ok, true);

    const hitA = await resolveProductByScannedBarcode(eanPrimary);
    const hitB = await resolveProductByScannedBarcode(eanAlias);
    assert.ok(hitA && hitB);
    assert.equal(hitA!.productId, product.id);
    assert.equal(hitB!.productId, product.id);
    console.log("OK P0#1 db — PRIMARY + ALIAS → même produit canonique");
  } finally {
    if (productId) {
      await prisma.productBarcode.deleteMany({ where: { productId } }).catch(() => undefined);
      await prisma.catalogEanMap.deleteMany({ where: { productId } }).catch(() => undefined);
      await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

optionalDbAttachRoundtrip().catch((e) => {
  console.error("FAIL db", e instanceof Error ? e.message : e);
  process.exit(1);
});
