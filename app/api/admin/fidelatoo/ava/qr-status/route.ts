import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { requireFidelatooAdmin, noStoreHeaders } from "@/lib/fidelatoo/admin-guard";
import { qrAvailability } from "@/lib/fidelatoo/qr-store";
import { getFidelatooStatus } from "@/lib/fidelatoo/orchestrator";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFidelatooAdmin(request);
    const qr = qrAvailability();
    const status = await getFidelatooStatus();
    return NextResponse.json(
      {
        available: qr.available,
        expiresAt: qr.expiresAt,
        ava: status.ava,
        role: status.role,
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
