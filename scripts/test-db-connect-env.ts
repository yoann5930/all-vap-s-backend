/**
 * Test DB connectivity from an env file. Never prints DATABASE_URL.
 * Usage: npx tsx scripts/test-db-connect-env.ts .env.path
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function unquote(value: string): string {
  let v = value.trim();
  for (let i = 0; i < 3; i++) {
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
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
  throw new Error("DATABASE_URL manquante");
}

function hostKind(url: string): string {
  try {
    const u = new URL(url);
    const host = (u.hostname || "").toLowerCase();
    if (!host) return "unknown";
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "localhost";
    if (host.endsWith(".local")) return "local_mdns";
    return "remote";
  } catch {
    return "unparseable";
  }
}

async function main() {
  const envPath = path.resolve(process.argv[2] || ".env");
  const url = loadDatabaseUrl(envPath);
  if (url === "[SENSITIVE]" || url === "SENSITIVE") {
    console.log(JSON.stringify({ ok: false, reason: "placeholder" }));
    process.exit(1);
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    console.log(JSON.stringify({ ok: false, reason: "not_postgres" }));
    process.exit(1);
  }
  const kind = hostKind(url);
  process.env.DATABASE_URL = url;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRawUnsafe("SELECT 1 as ok");
    console.log(
      JSON.stringify({
        ok: true,
        file: path.basename(envPath),
        hostKind: kind,
        urlLength: url.length,
      })
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        ok: false,
        file: path.basename(envPath),
        hostKind: kind,
        reason: e instanceof Error ? e.message.slice(0, 160) : "error",
      })
    );
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
