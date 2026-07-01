import { jsonResponse } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import { isDemoMode } from "@/lib/demo";

export async function GET() {
  try {
    if (isDemoMode()) {
      return jsonResponse({
        ok: true,
        service: "all-vaps",
        mode: "demo",
        timestamp: new Date().toISOString(),
      });
    }
    await prisma.$queryRaw`SELECT 1`;
    return jsonResponse({ ok: true, service: "all-vaps", mode: "database", timestamp: new Date().toISOString() });
  } catch {
    return jsonResponse({ ok: false, service: "all-vaps" }, 503);
  }
}