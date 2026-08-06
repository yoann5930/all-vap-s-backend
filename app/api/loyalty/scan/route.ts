import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { getFideleAToutConfig, lookupMemberByPhone, lookupMemberByScan } from "@/lib/fidele-a-tout";

/**
 * Consultation boutique / POS : reconnaissance client par QR All Vap's, barcode FAT, ou téléphone.
 * Réservé ADMIN (personnel boutique).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth("ADMIN");
    const { searchParams } = new URL(request.url);
    const code = (searchParams.get("code") || searchParams.get("qr") || "").trim();
    const phone = (searchParams.get("phone") || "").trim();

    if (!code && !phone) {
      return jsonResponse({ error: "Paramètre code ou phone requis" }, 400);
    }

    if (phone) {
      const normalized = phone.replace(/\s+/g, "");
      const local = await prisma.user.findFirst({
        where: {
          OR: [
            { phone: phone },
            { phone: normalized },
            { phone: { contains: normalized.slice(-9) } },
          ],
          role: "CUSTOMER",
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          loyaltyPoints: true,
          qrCode: true,
          fideleAToutMemberId: true,
          fideleAToutBarcode: true,
          fideleAToutSyncStatus: true,
        },
      });

      const fat = getFideleAToutConfig();
      let remote = null;
      if (fat.configured) {
        try {
          remote = await lookupMemberByPhone(normalized);
        } catch {
          remote = null;
        }
      }

      return jsonResponse({
        source: local ? "local" : remote ? "fidele_a_tout" : "none",
        customer: local,
        fideleATout: remote,
      });
    }

    const local = await prisma.user.findFirst({
      where: {
        OR: [
          { qrCode: code },
          { fideleAToutBarcode: code },
          { fideleAToutMemberId: code },
          { fideleAToutQrPayload: code },
        ],
        role: "CUSTOMER",
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        loyaltyPoints: true,
        qrCode: true,
        fideleAToutMemberId: true,
        fideleAToutBarcode: true,
        fideleAToutSyncStatus: true,
      },
    });

    const fat = getFideleAToutConfig();
    let remote = null;
    if (!local && fat.configured) {
      try {
        remote = await lookupMemberByScan(code);
      } catch {
        remote = null;
      }
    }

    if (!local && !remote) {
      return jsonResponse({ error: "Client introuvable", source: "none" }, 404);
    }

    return jsonResponse({
      source: local ? "local" : "fidele_a_tout",
      customer: local,
      fideleATout: remote,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
