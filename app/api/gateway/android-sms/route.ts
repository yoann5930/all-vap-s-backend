import { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import prisma from "@/lib/prisma";

/**
 * API passerelle Android (Samsung) — polling SMS à envoyer.
 * Authentification appareil : secret serveur + device id.
 * Ne renvoie jamais de secrets admin / paiement / Gmail.
 */

function authorizeGateway(request: NextRequest): boolean {
  if (process.env.ANDROID_GATEWAY_ENABLED !== "true") return false;
  const deviceId = request.headers.get("x-gateway-device-id") || "";
  const secret = request.headers.get("x-gateway-secret") || "";
  const expectedId = process.env.ANDROID_GATEWAY_DEVICE_ID || "";
  const expectedSecret = process.env.ANDROID_GATEWAY_SECRET || "";
  if (!deviceId || !secret || !expectedId || !expectedSecret) return false;
  try {
    const a = createHash("sha256").update(secret).digest();
    const b = createHash("sha256").update(expectedSecret).digest();
    return deviceId === expectedId && a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Récupère les SMS en file (payload minimal). */
export async function GET(request: NextRequest) {
  try {
    if (!authorizeGateway(request)) {
      return jsonResponse({ error: "Non autorisé ou passerelle désactivée" }, 401);
    }
    const items = await prisma.smsOutbox.findMany({
      where: { status: "queued", isTest: false },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: {
        id: true,
        bodyPreview: true,
        toMasked: true,
        createdAt: true,
      },
    });
    // Note : le numéro complet n'est pas encore stocké chiffré séparément —
    // tant que non branché, la file reste informative / test.
    return jsonResponse({
      messages: items.map((i) => ({
        id: i.id,
        // Destinataire réel à injecter uniquement quand chiffrement owner phone OK
        toMasked: i.toMasked,
        body: i.bodyPreview,
        createdAt: i.createdAt,
      })),
      note: "Payload minimal — numéro complet chiffré à brancher avant envoi SIM réel.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const ackSchema = z.object({
  id: z.string(),
  status: z.enum(["sent", "failed", "cancelled"]),
  providerRef: z.string().optional(),
  error: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!authorizeGateway(request)) {
      return jsonResponse({ error: "Non autorisé ou passerelle désactivée" }, 401);
    }
    const body = ackSchema.parse(await request.json());
    await prisma.smsOutbox.update({
      where: { id: body.id },
      data: {
        status: body.status,
        lastError: body.error || null,
        sentAt: body.status === "sent" ? new Date() : null,
        attempts: { increment: 1 },
      },
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
