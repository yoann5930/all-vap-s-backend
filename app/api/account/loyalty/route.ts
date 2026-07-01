import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getBaseUrl } from "@/lib/utils";

export async function GET() {
  try {
    const auth = await requireAuth();
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { loyaltyPoints: true, qrCode: true, firstName: true, email: true },
    });

    if (!user) throw new Error("NOT_FOUND");

    const qrData = `${getBaseUrl()}/account?qr=${user.qrCode}`;

    return jsonResponse({
      loyaltyPoints: user.loyaltyPoints,
      qrCode: user.qrCode,
      qrData,
      qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`,
      memberName: user.firstName || user.email.split("@")[0],
    });
  } catch (error) {
    return handleApiError(error);
  }
}
