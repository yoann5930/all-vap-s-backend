import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/rate-limit";
import { handleAvaTestDeleteSession } from "@/lib/ava-test/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = handleAvaTestDeleteSession({
    authorization: request.headers.get("authorization"),
    ip: clientIp(request),
    sessionId: id,
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
