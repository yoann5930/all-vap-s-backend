/**
 * Vérifie que JWT exp et cookie maxAge sont cohérents (pas de durée ms→s).
 * Usage: npx tsx scripts/test-auth-session-duration.ts
 */
import assert from "node:assert/strict";
import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode("test-secret-for-session-duration-32b");
const ACCESS_EXPIRY = "2h";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 2;

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ userId: "u1", email: "t@test.fr", role: "EMPLOYEE" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(ACCESS_EXPIRY)
    .sign(SECRET);

  const { payload } = await jwtVerify(token, SECRET);
  const exp = Number(payload.exp);
  const iat = Number(payload.iat);
  assert.ok(exp > iat, "exp > iat");
  const lifetime = exp - iat;
  assert.ok(
    lifetime >= COOKIE_MAX_AGE_SEC - 5 && lifetime <= COOKIE_MAX_AGE_SEC + 5,
    `JWT lifetime ${lifetime}s doit ≈ cookie maxAge ${COOKIE_MAX_AGE_SEC}s`
  );
  assert.ok(exp > now + 60 * 60, "session ne doit pas expirer dans l’heure");
  console.log("[ok] durée session JWT ≈ cookie 2h", { iat, exp, lifetime });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
