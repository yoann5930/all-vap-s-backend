/**
 * Applique les migrations Prisma sur la DATABASE_URL d'un fichier env.
 * N'affiche jamais l'URL. Pas de reset / pas de drop.
 *
 * Usage: npx tsx scripts/migrate-deploy-env.ts .env.production.local
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function unquote(value: string): string {
  let v = value.trim();
  for (let i = 0; i < 3; i++) {
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
      continue;
    }
    break;
  }
  return v.trim();
}

function loadDatabaseUrl(envPath: string): string {
  const raw = fs.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^DATABASE_URL\s*=\s*(.*)$/);
    if (m) return unquote(m[1]);
  }
  throw new Error(`DATABASE_URL manquante dans ${envPath}`);
}

function main() {
  const envPath = path.resolve(process.argv[2] || ".env.production.local");
  if (!fs.existsSync(envPath)) throw new Error(`Env introuvable: ${envPath}`);
  const url = loadDatabaseUrl(envPath);
  if (!/^postgres(ql)?:\/\//i.test(url) && !/^prisma(\+postgres(ql)?)?:\/\//i.test(url)) {
    throw new Error("DATABASE_URL protocole invalide");
  }

  console.log(`[migrate-deploy] file=${path.basename(envPath)} running prisma migrate deploy`);
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy"],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
      shell: true,
    }
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
  console.log("[migrate-deploy] OK");
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
