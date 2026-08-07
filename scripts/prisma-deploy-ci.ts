/**
 * Déploiement Prisma CI/Vercel.
 *
 * Corrige P3009 causé par une migration échouée orpheline en base
 * (`20260803_ava_memory_incidents`) absente de l'historique Git actuel.
 * S'exécute avec la DATABASE_URL réelle de l'environnement Vercel.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const ORPHAN_FAILED = "20260803_ava_memory_incidents";

function run(cmd: string, args: string[], allowFail = false): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
  });
  const stdout = r.stdout || "";
  const stderr = r.stderr || "";
  if (!allowFail && r.status !== 0) {
    process.stderr.write(stdout);
    process.stderr.write(stderr);
    process.exit(r.status ?? 1);
  }
  return { status: r.status, stdout, stderr };
}

function trackedMigrationNames(): Set<string> {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  );
}

function main() {
  if (!(process.env.DATABASE_URL || "").trim()) {
    console.error("[prisma-deploy-ci] DATABASE_URL manquant");
    process.exit(1);
  }

  const tracked = trackedMigrationNames();
  console.log(`[prisma-deploy-ci] migrations Git trackées: ${tracked.size}`);

  // Diagnostic (non bloquant)
  const status = run("npx", ["prisma", "migrate", "status"], true);
  const combined = `${status.stdout}\n${status.stderr}`;
  if (/P3009|failed migrations/i.test(combined)) {
    console.log("[prisma-deploy-ci] migrate status signale des migrations failed (P3009)");
  }

  // Cause source : entrée failed en base pour une migration absente du dépôt Git
  // (upload CLI local antérieur). Resolve rolled-back pour débloquer migrate deploy.
  if (!tracked.has(ORPHAN_FAILED)) {
    console.log(
      `[prisma-deploy-ci] tentative resolve --rolled-back ${ORPHAN_FAILED} (orpheline hors Git)`
    );
    const resolved = run(
      "npx",
      ["prisma", "migrate", "resolve", "--rolled-back", ORPHAN_FAILED],
      true
    );
    if (resolved.status === 0) {
      console.log(`[prisma-deploy-ci] ${ORPHAN_FAILED} marquée rolled-back`);
    } else {
      console.log(
        `[prisma-deploy-ci] resolve ignoré (pas en failed / déjà résolu) — code ${resolved.status}`
      );
    }
  }

  console.log("[prisma-deploy-ci] prisma migrate deploy");
  run("npx", ["prisma", "migrate", "deploy"]);

  const seed = path.join(process.cwd(), "scripts", "seed-inventory-staff-ci.ts");
  if (existsSync(seed)) {
    console.log("[prisma-deploy-ci] seed-inventory-staff-ci");
    run("npx", ["tsx", seed]);
  }

  console.log("[prisma-deploy-ci] OK");
}

main();
