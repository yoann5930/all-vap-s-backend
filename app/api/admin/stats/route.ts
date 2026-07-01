import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

async function requireAdmin() {
  return requireAuth("ADMIN");
}

export async function GET() {
  try {
    await requireAdmin();

    const [
      productCount, orderCount, userCount, revenue, pendingOrders,
      lowStock, recentOrders, topProducts,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.order.count(),
      prisma.user.count({ where: { role: "CUSTOMER" } }),
      prisma.order.aggregate({ where: { status: "PAID" }, _sum: { totalCents: true } }),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.product.count({ where: { stock: { lte: 5 }, isActive: true } }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { items: true },
      }),
      prisma.product.findMany({
        where: { isActive: true },
        orderBy: { salesCount: "desc" },
        take: 5,
      }),
    ]);

    return jsonResponse({
      productCount,
      orderCount,
      userCount,
      revenue: revenue._sum.totalCents || 0,
      pendingOrders,
      lowStock,
      recentOrders,
      topProducts,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const categorySchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const type = new URL(request.url).searchParams.get("type");

    if (type === "category") {
      const data = categorySchema.parse(await request.json());
      const category = await prisma.category.create({ data });
      return jsonResponse(category, 201);
    }

    return jsonResponse({ error: "Type invalide" }, 400);
  } catch (error) {
    return handleApiError(error);
  }
}
