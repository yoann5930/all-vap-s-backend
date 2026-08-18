import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/rate-limit";
import { handleOperatorCommand, handleOperatorStatus } from "@/lib/ava-device/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = await handleOperatorCommand({
    authorization: request.headers.get("authorization"),
    ip: clientIp(request),
    body,
  });
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (result.retryAfterSec) headers["Retry-After"] = String(result.retryAfterSec);
  return NextResponse.json(result.body, { status: result.status, headers });
}

export async function GET(request: NextRequest) {
  const deviceId = request.nextUrl.searchParams.get("deviceId") || "";
  const result = await handleOperatorStatus({
    authorization: request.headers.get("authorization"),
    deviceId,
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
