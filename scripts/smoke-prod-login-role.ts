/**
 * Smoke login PROD avec credentials via env uniquement (jamais loggés).
 * AUTH_SMOKE_EMAIL + AUTH_SMOKE_PASSWORD
 * AUTH_SMOKE_EXPECT_ROLE=OWNER|ADMIN|EMPLOYEE|CLIENT (optionnel)
 */
import assert from "node:assert/strict";

const BASE = process.env.AUTH_SMOKE_BASE || "https://www.allvaps.fr";
const email = (process.env.AUTH_SMOKE_EMAIL || "").trim().toLowerCase();
const password = process.env.AUTH_SMOKE_PASSWORD || "";
const expect = (process.env.AUTH_SMOKE_EXPECT_ROLE || "").toUpperCase();

if (!email || !password) {
  console.error("Missing AUTH_SMOKE_EMAIL / AUTH_SMOKE_PASSWORD");
  process.exit(2);
}

function extractCookies(res: Response): string {
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const list =
    typeof anyHeaders.getSetCookie === "function" ? anyHeaders.getSetCookie() : [];
  if (list.length) return list.map((c) => c.split(";")[0]).join("; ");
  const single = res.headers.get("set-cookie");
  return single ? single.split(",").map((p) => p.trim().split(";")[0]).join("; ") : "";
}

async function main() {
  console.log("smoke-prod-login-role", { base: BASE, emailDomain: email.split("@")[1] });

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const loginJson = (await loginRes.json().catch(() => ({}))) as {
    error?: string;
    token?: string;
    redirectTo?: string;
    user?: { role?: string; appRole?: string; email?: string };
  };

  if (!loginRes.ok) {
    console.log("LOGIN_FAIL", loginRes.status, loginJson.error || "unknown");
    process.exit(1);
  }

  const cookie = extractCookies(loginRes);
  const token = loginJson.token || "";
  assert.ok(token.length > 20, "token missing");

  const meRes = await fetch(`${BASE}/api/auth/me`, {
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const me = (await meRes.json()) as {
    authenticated?: boolean;
    user?: {
      role?: string;
      appRole?: string;
      redirectTo?: string;
      email?: string;
      isOwnerIdentity?: boolean;
    };
  };
  assert.equal(meRes.status, 200);
  assert.equal(me.authenticated, true);
  assert.ok(me.user);

  const appRole = me.user!.appRole || loginJson.user?.appRole || "";
  const dbRole = me.user!.role || "";
  const redirectTo = me.user!.redirectTo || loginJson.redirectTo || "";

  console.log(
    JSON.stringify({
      ok: true,
      dbRole,
      appRole,
      redirectTo,
      isOwnerIdentity: !!me.user!.isOwnerIdentity,
      emailMatch: (me.user!.email || "").toLowerCase() === email,
    })
  );

  if (expect) {
    assert.equal(appRole, expect, `expected appRole ${expect}`);
  }

  // Admin API with this session
  const adminRes = await fetch(`${BASE}/api/admin/ava/chat`, {
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  console.log(
    JSON.stringify({
      adminAvaStatus: adminRes.status,
      adminAvaAllowed: adminRes.status === 200,
    })
  );

  if (appRole === "CLIENT") {
    assert.ok([401, 403].includes(adminRes.status), "CLIENT must be denied admin AVA");
  }
  if (appRole === "OWNER" || appRole === "ADMIN") {
    assert.equal(adminRes.status, 200, "OWNER/ADMIN must access admin AVA");
  }

  console.log("PASS smoke-prod-login-role");
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
