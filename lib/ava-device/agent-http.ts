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

export function json(result: { status: number; body: Record<string, unknown> }) {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
