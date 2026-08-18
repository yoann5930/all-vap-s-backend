import { NextRequest, NextResponse } from "next/server";

export async function readSignedAgent(request: NextRequest): Promise<{
  deviceId: string;
  timestamp: string | null;
  signature: string | null;
  bodyRaw: string;
  body: unknown;
}> {
  const bodyRaw = await request.text();
  let body: unknown = {};
  if (bodyRaw.trim()) {
    try {
      body = JSON.parse(bodyRaw);
    } catch {
      body = {};
    }
  }
  return {
    deviceId: request.headers.get("x-ava-device-id") || "",
    timestamp: request.headers.get("x-ava-device-timestamp"),
    signature: request.headers.get("x-ava-device-signature"),
    bodyRaw,
    body,
  };
}

export async function json(
  result:
    | { status: number; body: Record<string, unknown> }
    | Promise<{ status: number; body: Record<string, unknown> }>,
) {
  const resolved = await result;
  return NextResponse.json(resolved.body, {
    status: resolved.status,
    headers: { "Cache-Control": "no-store" },
  });
}
