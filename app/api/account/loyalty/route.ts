import QRCode from "qrcode";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getBaseUrl } from "@/lib/utils";
import { getFideleAToutPublicStatus } from "@/lib/fidele-a-tout";

export async function GET() {
  try {
    const auth = await requireAuth();
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        loyaltyPoints: true,
        qrCode: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    if (!user) throw new Error("NOT_FOUND");

    const qrData = `${getBaseUrl()}/api/loyalty/scan?code=${encodeURIComponent(user.qrCode)}`;
    const qrImageUrl = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
      color: { dark: "#0B0B0C", light: "#FFFFFF" },
    });

    const history = await prisma.loyaltyLedgerEntry.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        delta: true,
        balanceAfter: true,
        reason: true,
        source: true,
        orderId: true,
        createdAt: true,
      },
    });

    const fidele = getFideleAToutPublicStatus();

    return jsonResponse({
      loyaltyPoints: user.loyaltyPoints,
      qrCode: user.qrCode,
      qrData,
      qrImageUrl,
      memberName:
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.email.split("@")[0],
      phone: user.phone,
      redeemAvailable: false,
      redeemNote:
        "Le rachat de points (100 pts = 1 €) sera activé avec Fidèle à Tout / le parcours boutique.",
      history,
      fideleATout: {
        ...fidele,
        memberId: null,
        barcode: null,
        syncStatus: "unlinked",
        lastSyncAt: null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
