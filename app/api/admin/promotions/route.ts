import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { isPromo10mlEligible } from "@/lib/promotions/promo-10ml";

const couponSchema = z.object({
  code: z.string().min(3),
  description: z.string().optional(),
  discountType: z.enum(["PERCENT", "FIXED"]),
  value: z.number().int().positive(),
  minOrderCents: z.number().int().default(0),
  maxUses: z.number().int().optional(),
  expiresAt: z.string().datetime().optional(),
});

const bannerSchema = z.object({
  title: z.string().min(2),
  subtitle: z.string().optional(),
  imageUrl: z.string().url(),
  linkUrl: z.string().optional(),
  placement: z.string().default("home"),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const type = new URL(request.url).searchParams.get("type");

    if (type === "banners") {
      return jsonResponse(await prisma.banner.findMany({ orderBy: { sortOrder: "asc" } }));
    }

    if (type === "promo10ml") {
      const items = await prisma.product.findMany({
        where: {
          promotion10mlEligible: true,
          volumeMl: 10,
          visibleOnline: true,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          brand: true,
          range: true,
          productFamily: true,
          productType: true,
          volumeMl: true,
          promotion10mlEligible: true,
          category: true,
          visibleOnline: true,
          rangeRef: { select: { slug: true, name: true } },
        },
        orderBy: { name: "asc" },
        take: 500,
      });
      return jsonResponse(
        items.filter((p) =>
          isPromo10mlEligible({
            name: p.name,
            brand: p.brand,
            range: p.rangeRef?.name ?? p.range,
            rangeSlug: p.rangeRef?.slug,
            productFamily: p.productFamily,
            category: p.category,
            productType: p.productType,
            volumeMl: p.volumeMl,
            catalogStatus: "valide",
            availableQuantity: 1,
            visibleOnline: true,
            isActive: true,
          })
        )
      );
    }

    return jsonResponse(await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } }));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const type = new URL(request.url).searchParams.get("type");
    const body =
      type === "promo10ml-sync"
        ? {}
        : type === "promo10ml-toggle" || type === "banner" || !type || type === "coupon"
          ? await request.json()
          : {};

    if (type === "banner") {
      const data = bannerSchema.parse(body);
      const banner = await prisma.banner.create({ data });
      return jsonResponse(banner, 201);
    }

    if (type === "promo10ml-toggle") {
      const data = z
        .object({
          productId: z.string(),
          promotion10mlEligible: z.boolean(),
        })
        .parse(body);
      const product = await prisma.product.findUnique({
        where: { id: data.productId },
        include: { rangeRef: { select: { slug: true, name: true } } },
      });
      if (!product) throw new Error("NOT_FOUND");
      if (data.promotion10mlEligible) {
        const eligible = isPromo10mlEligible({
          name: product.name,
          brand: product.brand,
          range: product.rangeRef?.name ?? product.range,
          rangeSlug: product.rangeRef?.slug,
          productFamily: product.productFamily,
          category: product.category,
          productType: product.productType,
          volumeMl: product.volumeMl ?? (product.productType === "10ml" ? 10 : null),
          visibleOnline: true,
          isActive: true,
          catalogStatus: "valide",
          availableQuantity: 1,
        });
        if (!eligible) {
          return jsonResponse(
            { error: "Offre réservée à E-Tasty One Taste 10 ml" },
            400
          );
        }
      }
      const updated = await prisma.product.update({
        where: { id: data.productId },
        data: {
          promotion10mlEligible: data.promotion10mlEligible,
          ...(data.promotion10mlEligible
            ? { volumeMl: 10, productType: product.productType || "10ml" }
            : {}),
        },
      });
      return jsonResponse(updated);
    }

    if (type === "promo10ml-sync") {
      // Marquer uniquement les e-liquides 10 ml publiés
      const candidates = await prisma.product.findMany({
        where: {
          isActive: true,
          visibleOnline: true,
          catalogStatus: { in: ["valide", "actif"] },
          OR: [
            { productFamily: "ETASTY_ONE_TASTE" },
            { rangeRef: { slug: "one-taste" } },
            { productType: "10ml" },
            { volumeMl: 10 },
          ],
        },
        select: {
          id: true,
          name: true,
          brand: true,
          range: true,
          productFamily: true,
          category: true,
          productType: true,
          volumeMl: true,
          promotion10mlEligible: true,
          rangeRef: { select: { slug: true, name: true } },
        },
      });

      let marked = 0;
      for (const p of candidates) {
        const eligible = isPromo10mlEligible({
          name: p.name,
          brand: p.brand,
          range: p.rangeRef?.name ?? p.range,
          rangeSlug: p.rangeRef?.slug,
          productFamily: p.productFamily,
          category: p.category,
          productType: p.productType,
          volumeMl: p.volumeMl ?? (p.productType === "10ml" ? 10 : null),
          visibleOnline: true,
          isActive: true,
          catalogStatus: "valide",
          availableQuantity: 1,
        });
        if (!eligible) continue;
        await prisma.product.update({
          where: { id: p.id },
          data: {
            volumeMl: 10,
            productType: p.productType || "10ml",
            promotion10mlEligible: true,
          },
        });
        marked++;
      }

      const cleared = await prisma.product.updateMany({
        where: {
          promotion10mlEligible: true,
          NOT: {
            OR: [{ productFamily: "ETASTY_ONE_TASTE" }, { range: { contains: "One Taste" } }],
          },
        },
        data: { promotion10mlEligible: false },
      });

      // Double filet : volume ≠ 10
      const clearedVolume = await prisma.product.updateMany({
        where: {
          promotion10mlEligible: true,
          volumeMl: { not: 10 },
          NOT: { productType: "10ml" },
        },
        data: { promotion10mlEligible: false },
      });

      return jsonResponse({
        marked,
        cleared: cleared.count + clearedVolume.count,
      });
    }

    const data = couponSchema.parse(body);
    const coupon = await prisma.coupon.create({
      data: {
        ...data,
        code: data.code.toUpperCase(),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      },
    });
    return jsonResponse(coupon, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
