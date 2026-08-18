import { NextRequest, NextResponse } from "next/server";
import { handleScreenshotGet } from "@/lib/ava-device/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = handleScreenshotGet({
    authorization: request.headers.get("authorization"),
    screenshotId: id,
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
