import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const auth = await requireAuth();
    const addresses = await prisma.address.findMany({
      where: { userId: auth.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return jsonResponse(addresses);
  } catch (error) {
    return handleApiError(error);
  }
}

const addressSchema = z.object({
  label: z.string().default("Domicile"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  street: z.string().min(3),
  city: z.string().min(2),
  postalCode: z.string().min(4),
  country: z.string().default("FR"),
  phone: z.string().optional(),
  isDefault: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const data = addressSchema.parse(await request.json());

    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { userId: auth.userId },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.create({
      data: { ...data, userId: auth.userId },
    });

    return jsonResponse(address, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new Error("NOT_FOUND");

    await prisma.address.deleteMany({ where: { id, userId: auth.userId } });
    return jsonResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
