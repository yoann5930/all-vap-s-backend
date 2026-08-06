/**
 * Probe login → Set-Cookie → /api/auth/me (cookie + Bearer).
 *
 * Credentials (priorité) :
 * 1. process.env AUTH_TEST_EMAIL / AUTH_TEST_PASSWORD
 * 2. fichier gitignoré `.local/auth-test.env`
 * 3. SEED_* dans `.env` (fallback)
 *
 * Never prints secrets or full tokens.
 */
import fs from "node:fs";
import path from "node:path";

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function loadEnv(): Record<string, string> {
  return {
    ...parseEnvFile(path.join(process.cwd(), ".env")),
    ...parseEnvFile(path.join(process.cwd(), ".local", "auth-test.env")),
  };
}

function cookieNames(setCookies: string[]): string[] {
  return setCookies.map((c) => c.split("=")[0]?.trim()).filter(Boolean);
}

function summarizeCookie(c: string) {
  const name = c.split("=")[0]?.trim();
  return {
    name,
    httpOnly: /httponly/i.test(c),
    secure: /(?:^|;)\s*secure(?:;|$)/i.test(c),
    sameSite: (/samesite=([^;]+)/i.exec(c) || [])[1] || null,
    path: (/path=([^;]+)/i.exec(c) || [])[1] || null,
    maxAge: (/max-age=([^;]+)/i.exec(c) || [])[1] || null,
    domain: (/domain=([^;]+)/i.exec(c) || [])[1] || "(host-only)",
  };
}

async function probe(base: string, email: string, password: string) {
  console.log(`\n=== BASE ${base} ===`);
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: base,
    },
    body: JSON.stringify({ email, password }),
  });

  const setCookies =
    typeof loginRes.headers.getSetCookie === "function"
      ? loginRes.headers.getSetCookie()
      : (() => {
          const single = loginRes.headers.get("set-cookie");
          return single ? [single] : [];
        })();

  const body = (await loginRes.json().catch(() => ({}))) as {
    user?: { id?: string; role?: string; email?: string };
    token?: string;
    error?: string;
  };

  console.log("LOGIN_STATUS", loginRes.status);
  console.log("LOGIN_ERROR", body.error || null);
  console.log("LOGIN_HAS_USER", Boolean(body.user), "ROLE", body.user?.role || null);
  console.log(
    "LOGIN_HAS_TOKEN",
    typeof body.token === "string",
    "TOKEN_LEN",
    body.token ? body.token.length : 0
  );
  console.log("SET_COOKIE_NAMES", cookieNames(setCookies).join(",") || "(none)");
  for (const c of setCookies) {
    console.log("COOKIE_DETAIL", JSON.stringify(summarizeCookie(c)));
  }

  const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");

  const meCookie = await fetch(`${base}/api/auth/me`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
  const meCookieBody = (await meCookie.json().catch(() => ({}))) as {
    user?: { role?: string };
  };
  console.log(
    "ME_COOKIE_STATUS",
    meCookie.status,
    "USER",
    Boolean(meCookieBody.user),
    "ROLE",
    meCookieBody.user?.role || null
  );

  if (body.token) {
    const meBearer = await fetch(`${base}/api/auth/me`, {
      headers: { authorization: `Bearer ${body.token}` },
      cache: "no-store",
    });
    const meBearerBody = (await meBearer.json().catch(() => ({}))) as {
      user?: { role?: string };
    };
    console.log(
      "ME_BEARER_STATUS",
      meBearer.status,
      "USER",
      Boolean(meBearerBody.user),
      "ROLE",
      meBearerBody.user?.role || null
    );

    const parts = body.token.split(".");
    if (parts.length === 3) {
      const hdr = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      console.log("JWT_ALG", hdr.alg);
      console.log("JWT_CLAIM_KEYS", Object.keys(payload).join(","));
      console.log("JWT_HAS_USERID", Boolean(payload.userId), "JWT_ROLE", payload.role);
      console.log(
        "JWT_IAT",
        payload.iat,
        "JWT_EXP",
        payload.exp,
        "TTL_SEC",
        payload.exp && payload.iat ? payload.exp - payload.iat : null
      );
      console.log(
        "JWT_EXPIRED_NOW",
        typeof payload.exp === "number" ? payload.exp * 1000 < Date.now() : null
      );
    }
  }

  return {
    loginOk: loginRes.status === 200 && Boolean(body.token),
    meCookieOk: meCookie.status === 200 && Boolean(meCookieBody.user),
    meBearerOk: body.token
      ? true
      : false,
  };
}

async function main() {
  const env = loadEnv();
  const email = (
    process.env.AUTH_TEST_EMAIL ||
    env.SEED_ADMIN_EMAIL ||
    "admin@allvaps.fr"
  ).toLowerCase();
  const password = process.env.AUTH_TEST_PASSWORD || env.SEED_ADMIN_PASSWORD || "";

  console.log("EMAIL_SET", Boolean(email), "EMAIL_LEN", email.length);
  console.log("PASSWORD_SET", Boolean(password), "PASSWORD_LEN", password.length);
  console.log(
    "JWT_SECRET_SET",
    Boolean(env.JWT_SECRET),
    "JWT_SECRET_LEN",
    env.JWT_SECRET ? env.JWT_SECRET.length : 0
  );
  console.log("APP_URL", env.NEXT_PUBLIC_APP_URL || "(absent)");

  if (!password) {
    console.log("NO_PASSWORD_SKIP");
    console.log(
      "Renseigner AUTH_TEST_EMAIL et AUTH_TEST_PASSWORD dans .local/auth-test.env (gitignoré)"
    );
    process.exit(2);
  }

  for (const base of [
    "https://inventaire.allvaps.fr",
    "https://www.allvaps.fr",
  ]) {
    await probe(base, email, password);
  }
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exit(1);
});
