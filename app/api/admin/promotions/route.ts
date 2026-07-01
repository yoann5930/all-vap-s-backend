import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

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

    return jsonResponse(await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } }));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const type = new URL(request.url).searchParams.get("type");
    const body = await request.json();

    if (type === "banner") {
      const data = bannerSchema.parse(body);
      const banner = await prisma.banner.create({ data });
      return jsonResponse(banner, 201);
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
