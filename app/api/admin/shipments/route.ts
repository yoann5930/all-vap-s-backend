import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireStaff } from "@/lib/jwt";
import { importAssistedCarrierLabel } from "@/lib/shipping/workflow";
import prisma from "@/lib/prisma";

/**
 * GET — liste des expéditions (MR / Relais Colis).
 */
export async function GET(request: NextRequest) {
  try {
    await requireStaff();
    const orderId = new URL(request.url).searchParams.get("orderId");
    const rows = await prisma.carrierShipment.findMany({
      where: orderId ? { orderId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return jsonResponse({ shipments: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const importSchema = z.object({
  orderId: z.string().min(1),
  trackingNumber: z.string().min(5).max(80),
  /** PDF base64 officiel (fourni hors site) — jamais inventé */
  labelPdfBase64: z.string().min(32),
  fileName: z.string().max(120).optional(),
  relayPointId: z.string().max(80).optional(),
});

/**
 * POST — import mode assisté d'une étiquette officielle + envoi gérant.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff();
    const body = importSchema.parse(await request.json());
    const pdf = Buffer.from(body.labelPdfBase64, "base64");
    if (pdf.length < 20 || pdf.subarray(0, 4).toString() !== "%PDF") {
      return jsonResponse(
        { error: "Le fichier doit être un PDF officiel (%PDF…)." },
        400
      );
    }
    const result = await importAssistedCarrierLabel({
      orderId: body.orderId,
      trackingNumber: body.trackingNumber,
      labelPdf: pdf,
      fileName: body.fileName,
      relayPointId: body.relayPointId,
      actorUserId: user.userId,
    });
    return jsonResponse({
      ok: true,
      reused: result.reused,
      shipment: {
        id: result.shipment.id,
        status: result.shipment.status,
        carrier: result.shipment.carrier,
        trackingNumber: result.shipment.trackingNumber,
        mode: result.shipment.mode,
        emailedToManager: result.shipment.emailedToManager,
        qrAvailable: result.shipment.qrAvailable,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
