import type { NextRequest } from "next/server";
import { requireAuth, type JwtPayload } from "@/lib/jwt";
import { assertSameOrigin } from "@/lib/security";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit/log";
import type { FidelatooCommand } from "./types";

/** ADMIN uniquement — Yoann / admins explicitement autorisés (rôle ADMIN). */
export async function requireFidelatooAdmin(request: NextRequest): Promise<JwtPayload> {
  const auth = await requireAuth("ADMIN");
  if (auth.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }

  const ip = clientIp(request);
  const limited = checkRateLimit(`fidelatoo-admin:${auth.userId}:${ip}`, 60, 60_000);
  if (!limited.ok) throw new Error("RATE_LIMITED");

  return auth;
}

export async function requireFidelatooMutation(
  request: NextRequest
): Promise<JwtPayload> {
  assertSameOrigin(request);
  return requireFidelatooAdmin(request);
}

export async function auditFidelatooAction(input: {
  user: JwtPayload;
  command: FidelatooCommand | string;
  actionId: string;
  ok: boolean;
  message?: string;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const meta = { ...(input.metadata || {}) };
  // Jamais de QR / secret / mot de passe dans les logs
  delete meta.qrImageBase64;
  delete meta.qr;
  delete meta.password;
  delete meta.secret;
  delete meta.token;

  await writeAuditLog({
    user: input.user,
    action: `fidelatoo.${input.command}`,
    ip: input.ip,
    metadata: {
      actionId: input.actionId,
      ok: input.ok,
      message: input.message?.slice(0, 200),
      ...meta,
    },
  });
}

export function noStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    Pragma: "no-cache",
    "X-Robots-Tag": "noindex, nofollow",
  };
}
