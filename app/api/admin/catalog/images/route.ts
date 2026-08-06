import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { attachProductImage } from "@/lib/catalog/import-unified";

export async function GET() {
  try {
    await requireAuth("ADMIN");

    const products = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        brand: true,
        range: true,
        imageUrl: true,
        imageStatus: true,
        catalogImages: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, url: true, status: true, sortOrder: true, createdAt: true },
        },
      },
      take: 200,
    });

    return jsonResponse({ products, total: products.length });
  } catch (error) {
    return handleApiError(error);
  }
}

const attachSchema = z.object({
  productId: z.string(),
  url: z
    .string()
    .refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/"), "URL image invalide"),
  status: z.enum(["official", "pending", "validated"]).optional(),
  sortOrder: z.number().int().optional(),
});

const updateStatusSchema = z.object({
  imageId: z.string(),
  status: z.enum(["official", "pending", "validated"]),
});

export async function POST(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const body = await request.json();
    const data = attachSchema.parse(body);
    const image = await attachProductImage(data);
    return jsonResponse(image, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const body = await request.json();
    const { imageId, status } = updateStatusSchema.parse(body);

    const image = await prisma.productImage.update({
      where: { id: imageId },
      data: { status },
    });

    if (status === "validated" || status === "official") {
      await prisma.product.update({
        where: { id: image.productId },
        data: { imageUrl: image.url, imageStatus: status },
      });
    }

    return jsonResponse(image);
  } catch (error) {
    return handleApiError(error);
  }
}
