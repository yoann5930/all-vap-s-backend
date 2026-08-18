import { handleAgentHeartbeat } from "@/lib/ava-device/http";
import { json, readSignedAgent } from "@/lib/ava-device/agent-http";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const signed = await readSignedAgent(request);
  return json(handleAgentHeartbeat(signed));
}
