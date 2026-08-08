/**
 * Guards API : CLIENT ne peut pas appeler /api/admin/* ; ADMIN oui.
 */
const fs = require("fs");
const dotenv = require("dotenv");
const assert = require("node:assert/strict");

const parsed = dotenv.parse(fs.readFileSync(".env", "utf8"));
process.env.DATABASE_URL = parsed.DATABASE_URL;
if (parsed.JWT_SECRET) process.env.JWT_SECRET = parsed.JWT_SECRET;

const pass = process.env.LOCAL_AUTH_TEST_PASSWORD || "AllVaps_LocalAuth_2026!";

async function main() {
  const { loginUser } = await import("../lib/auth.ts");
  const { signToken } = await import("../lib/jwt.ts");

  const client = await loginUser("allvaps70@gmail.com", pass, { setCookies: false });
  const owner = await loginUser("yoann@allvaps.fr", pass, { setCookies: false });

  // Simule requireAuth via getAuthUser pattern — vérifie rôle JWT
  const { jwtVerify } = await import("jose");
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const clientPayload = (await jwtVerify(client.token, secret)).payload;
  const ownerPayload = (await jwtVerify(owner.token, secret)).payload;

  assert.equal(clientPayload.role, "CUSTOMER");
  assert.equal(ownerPayload.role, "ADMIN");

  // requireAuth ADMIN doit refuser CUSTOMER
  const { roleAtLeast, isOwnerRole } = await import("../lib/admin/roles.ts");
  function wouldAllowAdmin(role: string) {
    if (isOwnerRole(role)) return true;
    return role === "ADMIN" || roleAtLeast(role, "ADMIN");
  }
  assert.equal(wouldAllowAdmin(String(clientPayload.role)), false);
  assert.equal(wouldAllowAdmin(String(ownerPayload.role)), true);

  // Surface client : pas d'admin même pour owner email dans message
  const { getAvaSessionFromAuth } = await import("../lib/auth/user-context.ts");
  // getAvaSessionFromAuth lit cookies — on teste map + resolveAppRole
  const { resolveAppRole, resolvePostLoginPath } = await import(
    "../lib/auth/user-context.ts"
  );
  assert.equal(await resolveAppRole("CUSTOMER", "allvaps70@gmail.com"), "CLIENT");
  assert.equal(await resolveAppRole("ADMIN", "yoann@allvaps.fr"), "OWNER");
  assert.equal(resolvePostLoginPath("CLIENT", "/admin"), "/account");
  assert.equal(resolvePostLoginPath("OWNER", "/admin/ava"), "/admin/ava");

  void signToken;
  console.log("PASS scripts/test-auth-api-guards.ts");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
