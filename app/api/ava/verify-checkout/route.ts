import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { calculatePromo10ml, type Promo10mlCartLine } from "@/lib/promotions/promo-10ml";
import { calculatePromoTwenty, type PromoTwentyCartLine } from "@/lib/promotions/promo-twenty";
import { formatAvaCheckoutVerification } from "@/lib/ava/shop-offers";

const schema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        variantId: z.string().optional().nullable(),
        quantity: z.number().int().positive().max(99),
      })
    )
    .min(1)
    .max(50),
});

/**
 * Recalcule les offres Twenty + 10 ml depuis la DB (source de vérité)
 * pour qu'A.V.A. valide le panier avant paiement.
 */
export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const products = await prisma.product.findMany({
      where: {
        id: { in: body.items.map((i) => i.productId) },
        isActive: true,
        visibleOnline: true,
      },
      include: {
        variants: { where: { active: true } },
        rangeRef: { select: { slug: true, name: true } },
      },
    });

    let subtotal = 0;
    const twentyLines: PromoTwentyCartLine[] = [];
    const promo10Lines: Promo10mlCartLine[] = [];

    for (const item of body.items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;
      const variant = item.variantId
        ? product.variants.find((v) => v.id === item.variantId)
        : null;
      const price =
        variant?.priceCents && variant.priceCents > 0
          ? variant.priceCents
          : product.isPromo && product.promoPriceCents
            ? product.promoPriceCents
            : product.priceCents;
      subtotal += price * item.quantity;

      twentyLines.push({
        productId: product.id,
        variantId: item.variantId,
        name: product.name,
        quantity: item.quantity,
        unitPriceCents: price,
        category: product.category,
        productType: product.productType,
        volumeMl: product.volumeMl,
        brand: product.brand,
        range: product.rangeRef?.name ?? product.range,
        rangeSlug: product.rangeRef?.slug ?? null,
        productFamily: product.productFamily,
        availableQuantity: item.quantity,
      });

      promo10Lines.push({
        productId: product.id,
        variantId: item.variantId,
        name: product.name,
        quantity: item.quantity,
        unitPriceCents: price,
        category: product.category,
        productType: product.productType,
        volumeMl: product.volumeMl,
        promotion10mlEligible: product.promotion10mlEligible,
        brand: product.brand,
        range: product.rangeRef?.name ?? product.range,
        rangeSlug: product.rangeRef?.slug ?? null,
        productFamily: product.productFamily,
        availableQuantity: item.quantity,
      });
    }

    const twenty = calculatePromoTwenty(twentyLines);
    const promo10 = calculatePromo10ml(promo10Lines);
    const discountCents = Math.min(twenty.discountCents + promo10.discountCents, Math.max(0, subtotal));
    const totalCents = Math.max(0, subtotal - discountCents);

    return jsonResponse({
      ok: true,
      avaMessage: formatAvaCheckoutVerification({
        twenty,
        promo10,
        totalCents,
      }),
      subtotalCents: subtotal,
      discountCents,
      totalCents,
      twenty: {
        eligibleQuantity: twenty.eligibleQuantity,
        unitCents: twenty.unitCents,
        freeExtra: twenty.freeExtra,
        payCents: twenty.payCents,
        discountCents: twenty.discountCents,
        label: twenty.label,
        extras: twenty.extras,
      },
      promo10ml: {
        eligibleQuantity: promo10.eligibleQuantity,
        unitCents: promo10.unitCents,
        freeExtra: promo10.freeExtra,
        freeQuantity: promo10.freeQuantity,
        payCents: promo10.payCents,
        discountCents: promo10.discountCents,
        label: promo10.label,
        extras: promo10.extras,
        avaSummary: promo10.avaSummary,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
