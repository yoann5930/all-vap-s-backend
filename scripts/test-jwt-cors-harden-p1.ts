/**
 * P1#3 — JWT fail-closed + CORS sans wildcard *.vercel.app.
 * npx tsx scripts/test-jwt-cors-harden-p1.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isAllowedOrigin as edgeAllowed,
  getAllowedOrigins as edgeOrigins,
} from "../lib/security-origins";
import {
  isAllowedOrigin as nodeAllowed,
  getAllowedOrigins as nodeOrigins,
} from "../lib/security";
import {
  isProductionDeployment,
  isVercelRuntime,
  requiresHardenedSecrets,
} from "../lib/production-guards";

const saved = { ...process.env };

function restoreEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in saved)) delete process.env[k];
  }
  Object.assign(process.env, saved);
}

function withEnv(patch: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(patch)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// --- requiresHardenedSecrets / Vercel bypass APP_URL localhost ---
withEnv(
  {
    VERCEL: "1",
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  },
  () => {
    assert.equal(isVercelRuntime(), true);
    assert.equal(requiresHardenedSecrets(), true);
    assert.equal(isProductionDeployment(), true);
  }
);

withEnv(
  {
    VERCEL: undefined,
    VERCEL_ENV: undefined,
    NODE_ENV: "development",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  },
  () => {
    assert.equal(requiresHardenedSecrets(), false);
  }
);

withEnv(
  {
    VERCEL: undefined,
    VERCEL_ENV: undefined,
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://www.allvaps.fr",
  },
  () => {
    assert.equal(requiresHardenedSecrets(), true);
  }
);

// --- CORS : random vercel.app refusé ; allowlist / same-host OK ---
withEnv(
  {
    VERCEL_URL: "all-vap-s-backend-abc123.vercel.app",
    ALLOWED_ORIGINS: "",
    NODE_ENV: "production",
  },
  () => {
    assert.equal(
      edgeAllowed("https://evil-other.vercel.app", "www.allvaps.fr"),
      false,
      "wildcard vercel.app interdit"
    );
    assert.equal(
      nodeAllowed("https://evil-other.vercel.app", "www.allvaps.fr"),
      false
    );
    assert.equal(
      edgeAllowed("https://random.trycloudflare.com", "www.allvaps.fr"),
      false,
      "wildcard cloudflare interdit"
    );
    assert.equal(
      edgeAllowed("https://www.allvaps.fr", "www.allvaps.fr"),
      true,
      "same-host OK"
    );
    assert.equal(
      edgeAllowed("https://inventaire.allvaps.fr", "www.allvaps.fr"),
      true,
      "allowlist inventaire OK"
    );
    const origins = edgeOrigins();
    assert.ok(
      origins.some((o) => o.includes("all-vap-s-backend-abc123.vercel.app")),
      "VERCEL_URL du projet dans allowlist"
    );
    assert.equal(
      edgeAllowed(
        "https://all-vap-s-backend-abc123.vercel.app",
        "www.allvaps.fr"
      ),
      true,
      "origine = VERCEL_URL projet OK"
    );
  }
);

restoreEnv();

const jwtSrc = readFileSync("lib/jwt.ts", "utf8");
assert.ok(jwtSrc.includes("requiresHardenedSecrets"));
assert.ok(!jwtSrc.includes("function isLocalAppUrl"));

const edgeSrc = readFileSync("lib/security-origins.ts", "utf8");
assert.ok(!edgeSrc.includes('endsWith(".vercel.app")'));
assert.ok(!edgeSrc.includes('endsWith(".trycloudflare.com")'));

const secSrc = readFileSync("lib/security.ts", "utf8");
assert.ok(!secSrc.includes('endsWith(".vercel.app")'));
assert.ok(!secSrc.includes('endsWith(".trycloudflare.com")'));

const guardsSrc = readFileSync("lib/production-guards.ts", "utf8");
assert.ok(guardsSrc.includes("isVercelRuntime"));
assert.ok(guardsSrc.includes("requiresHardenedSecrets"));
assert.ok(guardsSrc.includes("secret.length < 32"));

void nodeOrigins;

console.log("OK P1#3 — JWT fail-closed + CORS sans wildcard vercel/cloudflare");
