/**
 * Tokens d'action préparateur — boutons e-mail sécurisés.
 * Signés serveur. Idempotents. Pas un simple lien ouvert.
 */
import { SignJWT, jwtVerify } from "jose";

export type PrepActionKind = "start_preparing" | "mark_ready";

function secretKey(): Uint8Array | null {
  const secret = (process.env.JWT_SECRET || "").trim();
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

export async function createPrepActionToken(
  orderId: string,
  action: PrepActionKind = "start_preparing",
  ttlDays = 14,
): Promise<string | null> {
  const key = secretKey();
  if (!key || !orderId) return null;
  return new SignJWT({ orderId, action })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlDays}d`)
    .setJti(`prep:${orderId}:${action}`)
    .sign(key);
}

export async function verifyPrepActionToken(
  token: string,
  expected: PrepActionKind = "start_preparing",
): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  const key = secretKey();
  if (!key) return { ok: false, error: "NOT_CONFIGURED" };
  const raw = token.trim();
  if (!raw) return { ok: false, error: "MISSING" };
  try {
    const { payload } = await jwtVerify(raw, key);
    if (payload.action !== expected || typeof payload.orderId !== "string") {
      return { ok: false, error: "INVALID" };
    }
    return { ok: true, orderId: payload.orderId };
  } catch {
    return { ok: false, error: "INVALID" };
  }
}

export async function prepActionPublicUrl(
  orderId: string,
  publicUrl: string,
  action: PrepActionKind = "start_preparing",
): Promise<string | null> {
  const token = await createPrepActionToken(orderId, action);
  if (!token) return null;
  const base = publicUrl.replace(/\/$/, "");
  const path = action === "mark_ready" ? "/api/prep/ready" : "/api/prep/start";
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}
