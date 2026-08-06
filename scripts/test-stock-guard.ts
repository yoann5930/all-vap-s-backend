/**
 * Tests anti-survente / validation stock (sans SumUp réseau).
 * Usage: npx tsx scripts/test-stock-guard.ts
 */
import assert from "node:assert/strict";
import prisma from "../lib/prisma";
import { ensureGlobalStockLocation, computeAvailable } from "../lib/catalog/stock";
import {
  validateCartStock,
  reserveStockForOrder,
  releaseOrderReservations,
  commitSaleForOrder,
} from "../lib/stock";

async function main() {
  let failed = 0;
  const check = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`OK  ${name}`);
    } catch (e) {
      failed += 1;
      console.error(`FAIL ${name}:`, e instanceof Error ? e.message : e);
    }
  };

  const location = await ensureGlobalStockLocation();

  // Produit jetable de test
  const suffix = Date.now().toString(36);
  const product = await prisma.product.create({
    data: {
      name: `TEST STOCK ${suffix}`,
      slug: `test-stock-${suffix}`,
      category: "test",
      priceCents: 1000,
      stock: 1,
      isActive: true,
      visibleOnline: false,
      catalogStatus: "a_verifier",
      variants: {
        create: {
          name: "0 mg",
          nicotineMg: 0,
          nicotineLabel: "0 mg",
          stock: 1,
          active: true,
        },
      },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];

  await prisma.stockLevel.create({
    data: {
      productId: product.id,
      variantId: variant.id,
      locationId: location.id,
      quantity: 1,
      reservedQuantity: 0,
      availableQuantity: 1,
      lowStockThreshold: 5,
      source: "test",
      lastSyncedAt: new Date(),
    },
  });

  await check("stock positif validé", async () => {
    const r = await validateCartStock([
      { productId: product.id, variantId: variant.id, quantity: 1 },
    ]);
    assert.equal(r.ok, true);
  });

  await check("refus quantité > stock", async () => {
    const r = await validateCartStock([
      { productId: product.id, variantId: variant.id, quantity: 2 },
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "STOCK_INSUFFICIENT");
  });

  await check("anti-survente concurrente (2 réservations sur 1 unité)", async () => {
    const a = await reserveStockForOrder({
      orderId: `test-a-${suffix}`,
      lines: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
    });
    assert.equal(a.ok, true);
    const b = await reserveStockForOrder({
      orderId: `test-b-${suffix}`,
      lines: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
    });
    assert.equal(b.ok, false);
    await releaseOrderReservations(`test-a-${suffix}`);
  });

  await check("rupture après vente", async () => {
    // Remettre 1 disponible
    await prisma.stockLevel.updateMany({
      where: { productId: product.id, variantId: variant.id },
      data: { quantity: 1, reservedQuantity: 0, availableQuantity: 1 },
    });
    const orderId = `test-sale-${suffix}`;
    // commande minimale pour commitSale
    await prisma.order.create({
      data: {
        id: orderId,
        customerEmail: "test@example.com",
        status: "PENDING",
        totalCents: 1000,
        items: {
          create: {
            productId: product.id,
            variantId: variant.id,
            quantity: 1,
            priceCents: 1000,
          },
        },
      },
    });
    const reserved = await reserveStockForOrder({
      orderId,
      lines: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
    });
    assert.equal(reserved.ok, true);
    const sold = await commitSaleForOrder(orderId);
    assert.equal(sold.ok, true);
    const level = await prisma.stockLevel.findFirst({
      where: { productId: product.id, variantId: variant.id },
    });
    assert.ok(level);
    assert.equal(level!.quantity, 0);
    assert.equal(computeAvailable(level!.quantity, level!.reservedQuantity), 0);
    const again = await validateCartStock([
      { productId: product.id, variantId: variant.id, quantity: 1 },
    ]);
    assert.equal(again.ok, false);
  });

  // Cleanup
  await prisma.order.deleteMany({ where: { id: { startsWith: `test-` } } }).catch(() => null);
  await prisma.order.deleteMany({ where: { customerEmail: "test@example.com", totalCents: 1000 } });
  await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
  await prisma.stockLevel.deleteMany({ where: { productId: product.id } });
  await prisma.productVariant.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });

  await prisma.$disconnect();
  if (failed) {
    console.error(`\n${failed} échec(s)`);
    process.exit(1);
  }
  console.log("\nTests stock guard OK.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
