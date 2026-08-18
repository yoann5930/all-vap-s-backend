import { NextRequest, NextResponse } from "next/server";
import { handleAgentEnroll } from "@/lib/ava-device/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = handleAgentEnroll({
    authorization: request.headers.get("authorization"),
    body,
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
