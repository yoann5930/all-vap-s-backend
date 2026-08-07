import { createHmac, timingSafeEqual } from "node:crypto";

export function signPayload(secret: string, body: string, timestamp: string, nonce: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${body}`)
    .digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

const usedNonces = new Map<string, number>();

export function assertRequestAuth(input: {
  secret: string;
  body: string;
  timestamp: string;
  nonce: string;
  signature: string;
  maxSkewSec: number;
}): { ok: true } | { ok: false; message: string } {
  const { secret, body, timestamp, nonce, signature, maxSkewSec } = input;
  if (!secret || !timestamp || !nonce || !signature) {
    return { ok: false, message: "Auth headers manquants" };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, message: "Timestamp invalide" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > maxSkewSec) {
    return { ok: false, message: "Timestamp hors fenêtre (anti-rejeu)" };
  }

  const nowMs = Date.now();
  for (const [k, exp] of usedNonces) {
    if (nowMs >= exp) usedNonces.delete(k);
  }
  if (usedNonces.has(nonce)) {
    return { ok: false, message: "Nonce déjà utilisé (anti-rejeu)" };
  }

  const expected = signPayload(secret, body, timestamp, nonce);
  if (!safeEqualHex(expected, signature)) {
    return { ok: false, message: "Signature invalide" };
  }

  usedNonces.set(nonce, nowMs + maxSkewSec * 1000);
  return { ok: true };
}
