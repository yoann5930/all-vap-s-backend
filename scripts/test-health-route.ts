/**
 * Tests santé — timeouts, DB ok/ko simulés, services optionnels, HTTP live si serveur up.
 * npm run health:test
 */
import {
  checkApplication,
  checkDatabase,
  checkOptionalEnvServices,
  overallStatus,
  withTimeout,
} from "../lib/health/checks";

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  [PASS] ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function unitTests() {
  console.log("\n--- Unitaires ---");

  ok("application liveness", checkApplication().status === "ok");

  const t0 = Date.now();
  try {
    await withTimeout(
      new Promise((r) => setTimeout(r, 50)),
      200,
      "fast"
    );
    ok("withTimeout success", Date.now() - t0 < 200);
  } catch {
    ok("withTimeout success", false);
  }

  const t1 = Date.now();
  try {
    await withTimeout(
      new Promise((r) => setTimeout(r, 500)),
      80,
      "slow"
    );
    ok("withTimeout abort", false, "should have thrown");
  } catch (e) {
    const msg = (e as Error).message;
    ok(
      "withTimeout abort",
      msg.includes("slow_timeout"),
      `${msg} in ${Date.now() - t1}ms`
    );
  }

  const dbOk = await checkDatabase({
    query: async () => ({ ok: true }),
    timeoutMs: 200,
  });
  ok("database available (simulated)", dbOk.status === "ok", `ms=${dbOk.ms}`);

  const dbDown = await checkDatabase({
    query: async () => {
      throw new Error("ECONNREFUSED_simulated");
    },
    timeoutMs: 200,
  });
  ok(
    "database unavailable (simulated)",
    dbDown.status === "error" &&
      (dbDown.detail || "").includes("ECONNREFUSED_simulated"),
    dbDown.detail
  );

  const dbHang = await checkDatabase({
    query: async () =>
      new Promise((r) => {
        setTimeout(r, 2000);
      }),
    timeoutMs: 100,
  });
  ok(
    "database hang → timeout (no open wait)",
    dbHang.status === "error" && (dbHang.detail || "").includes("timeout"),
    dbHang.detail
  );

  const optional = checkOptionalEnvServices();
  ok(
    "optional external services do not throw",
    !!optional.email && !!optional.payment,
    `email=${optional.email.status} payment=${optional.payment.status}`
  );

  ok(
    "overallStatus error when db error",
    overallStatus({ status: "ok" }, { status: "error" }) === "error"
  );
  ok(
    "overallStatus ok when both ok",
    overallStatus({ status: "ok" }, { status: "ok" }) === "ok"
  );
}

async function liveHttp() {
  const base = process.env.HEALTH_BASE_URL || "http://127.0.0.1:3000";
  console.log(`\n--- HTTP live @ ${base} ---`);

  async function get(path: string, budgetMs = 5000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), budgetMs);
    const started = Date.now();
    try {
      const res = await fetch(`${base}${path}`, { signal: ctrl.signal });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      return { res, json, ms: Date.now() - started };
    } finally {
      clearTimeout(t);
    }
  }

  try {
    const probe = await get("/api/health/live", 3000);
    if (!probe.res.ok) {
      console.log("  [SKIP] serveur non prêt — tests HTTP ignorés");
      return;
    }
  } catch {
    console.log("  [SKIP] serveur inaccessible — tests HTTP ignorés");
    return;
  }

  const health = await get("/api/health", 5000);
  ok(
    "/api/health HTTP 200",
    health.res.status === 200,
    `status=${health.res.status} ms=${health.ms}`
  );
  ok(
    "/api/health under audit budget (<20s)",
    health.ms < 20000,
    `${health.ms}ms`
  );
  // Premier hit peut compiler la route (~1–2s) ; le budget audit reste <20s.
  if (health.ms >= 1000) {
    console.log(`  [INFO] /api/health first hit ${health.ms}ms (compile possible)`);
  } else {
    ok("/api/health ideally <1s", true, `${health.ms}ms`);
  }
  ok(
    "/api/health shape",
    health.json.status === "ok" &&
      health.json.service === "all-vaps" &&
      typeof health.json.uptime === "number" &&
      (health.json.checks as { database?: string })?.database === "ok",
    JSON.stringify(health.json).slice(0, 160)
  );

  const live = await get("/api/health/live", 2000);
  ok("/api/health/live 200", live.res.status === 200 && live.ms < 1000);

  const ready = await get("/api/health/ready", 5000);
  ok(
    "/api/health/ready DB available",
    ready.res.status === 200 &&
      (ready.json.checks as { database?: string })?.database === "ok",
    `ms=${ready.ms}`
  );

  const details = await get("/api/health/details", 5000);
  ok(
    "/api/health/details no crash",
    details.res.status === 200 || details.res.status === 503,
    `status=${details.res.status} ms=${details.ms}`
  );

  // Warm path : idéalement <1s
  const warm = await get("/api/health", 5000);
  ok(
    "/api/health warm <1s",
    warm.res.status === 200 && warm.ms < 1000,
    `${warm.ms}ms`
  );
}

async function main() {
  console.log("=== HEALTH TESTS ===");
  await unitTests();
  await liveHttp();
  console.log(`\nRésultat: ${passed} OK, ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
