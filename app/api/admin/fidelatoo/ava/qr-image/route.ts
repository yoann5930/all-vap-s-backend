import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import {
  requireFidelatooAdmin,
  noStoreHeaders,
  auditFidelatooAction,
} from "@/lib/fidelatoo/admin-guard";
import { readQrForAdmin, runFidelatooCommand } from "@/lib/fidelatoo/orchestrator";
import { clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Image QR — ADMIN uniquement, no-store, jamais indexée.
 * Ne logue jamais le contenu binaire.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireFidelatooAdmin(request);
    let qr = readQrForAdmin();

    if (!qr) {
      const fetched = await runFidelatooCommand("ava.qr_image");
      await auditFidelatooAction({
        user,
        command: "ava.qr_image",
        actionId: fetched.actionId,
        ok: fetched.ok,
        message: fetched.ok ? "QR récupéré" : fetched.message,
        ip: clientIp(request),
      });
      qr = readQrForAdmin();
      if (!qr || !fetched.ok) {
        return NextResponse.json(
          { error: fetched.message || "QR indisponible" },
          { status: 404, headers: noStoreHeaders() }
        );
      }
    } else {
      await auditFidelatooAction({
        user,
        command: "ava.qr_image",
        actionId: "local-cache",
        ok: true,
        message: "QR affiché depuis cache éphémère",
        ip: clientIp(request),
      });
    }

    const buf = Buffer.from(qr.imageBase64, "base64");
    return new NextResponse(buf, {
      status: 200,
      headers: {
        ...noStoreHeaders(),
        "Content-Type": qr.mime || "image/png",
        "Content-Length": String(buf.length),
        "X-QR-Expires-At": qr.expiresAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
