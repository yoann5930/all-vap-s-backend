/**
 * Multi codes-barres → produit canonique (même stock).
 * Product.barcode = primaire dénormalisé ; ProductBarcode = source de vérité.
 */
import { randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { normalizeEan } from "@/lib/catalog/backfill-product-barcodes";

export type BarcodeRole = "PRIMARY" | "ALIAS";

function newId() {
  return randomBytes(12).toString("hex");
}

export function barcodeCandidates(raw: string): string[] {
  const scanned = String(raw || "").trim();
  const ean = normalizeEan(scanned);
  const out = new Set<string>();
  if (scanned) out.add(scanned);
  if (ean) {
    out.add(ean);
    if (ean.length === 12) out.add(`0${ean}`);
    if (ean.length === 13 && ean.startsWith("0")) out.add(ean.slice(1));
  }
  return [...out];
}

export async function listProductBarcodes(productId: string) {
  return prisma.productBarcode.findMany({
    where: { productId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * Associe un EAN au produit. Si role=PRIMARY, rétrograde l’ancien primaire en ALIAS
 * et met à jour Product.barcode.
 */
export async function attachBarcodeToProduct(params: {
  productId: string;
  barcode: string;
  role?: BarcodeRole;
  label?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string; code?: string }> {
  const digits = normalizeEan(params.barcode) || String(params.barcode || "").trim();
  if (!digits || digits.length < 6) {
    return { ok: false, error: "Code-barres invalide", code: "INVALID_BARCODE" };
  }

  const product = await prisma.product.findUnique({
    where: { id: params.productId },
    select: { id: true, barcode: true, category: true },
  });
  if (!product) return { ok: false, error: "Produit introuvable", code: "NOT_FOUND" };

  const existing = await prisma.productBarcode.findUnique({
    where: { barcode: digits },
  });
  if (existing && existing.productId !== product.id) {
    return {
      ok: false,
      error: "Ce code-barres est déjà lié à un autre produit",
      code: "BARCODE_TAKEN",
    };
  }
  if (existing && existing.productId === product.id) {
    return { ok: true, id: existing.id };
  }

  // Aussi bloquer si Product.barcode d’un autre produit
  const otherProduct = await prisma.product.findFirst({
    where: { barcode: digits, id: { not: product.id } },
    select: { id: true, name: true },
  });
  if (otherProduct) {
    return {
      ok: false,
      error: `Code déjà utilisé par un autre produit (${otherProduct.name})`,
      code: "BARCODE_TAKEN",
    };
  }

  const role: BarcodeRole = params.role === "PRIMARY" ? "PRIMARY" : "ALIAS";

  const row = await prisma.$transaction(async (tx) => {
    if (role === "PRIMARY") {
      await tx.productBarcode.updateMany({
        where: { productId: product.id, role: "PRIMARY" },
        data: { role: "ALIAS", label: "ancien packaging" },
      });
      await tx.product.update({
        where: { id: product.id },
        data: { barcode: digits },
      });
    } else if (!product.barcode) {
      // Premier EAN → primaire
      await tx.product.update({
        where: { id: product.id },
        data: { barcode: digits },
      });
    }

    const created = await tx.productBarcode.create({
      data: {
        id: newId(),
        productId: product.id,
        barcode: digits,
        role: role === "PRIMARY" || !product.barcode ? "PRIMARY" : "ALIAS",
        label: params.label ?? null,
      },
    });

    // Mémoire inventaire / classification
    await tx.catalogEanMap.upsert({
      where: { ean: digits },
      create: {
        id: newId(),
        ean: digits,
        productId: product.id,
        category: product.category,
        confidence: "CONFIRME",
        source: "admin_barcode_alias",
        validatedAt: new Date(),
      },
      update: {
        productId: product.id,
        confidence: "CONFIRME",
        source: "admin_barcode_alias",
        validatedAt: new Date(),
      },
    });

    return created;
  });

  return { ok: true, id: row.id };
}

export async function detachBarcodeFromProduct(params: {
  productId: string;
  barcode: string;
}): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const digits = normalizeEan(params.barcode) || String(params.barcode || "").trim();
  const row = await prisma.productBarcode.findUnique({ where: { barcode: digits } });
  if (!row || row.productId !== params.productId) {
    return { ok: false, error: "Association introuvable", code: "NOT_FOUND" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.productBarcode.delete({ where: { id: row.id } });
    if (row.role === "PRIMARY") {
      const next = await tx.productBarcode.findFirst({
        where: { productId: params.productId },
        orderBy: { createdAt: "asc" },
      });
      if (next) {
        await tx.productBarcode.update({
          where: { id: next.id },
          data: { role: "PRIMARY" },
        });
        await tx.product.update({
          where: { id: params.productId },
          data: { barcode: next.barcode },
        });
      } else {
        await tx.product.update({
          where: { id: params.productId },
          data: { barcode: null },
        });
      }
    }
  });

  return { ok: true };
}
