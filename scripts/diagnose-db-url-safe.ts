/**
 * Diagnose DATABASE_URL in one or more env files — never prints the secret.
 * Usage: npx tsx scripts/diagnose-db-url-safe.ts [path...]
 */
import fs from "node:fs";
import path from "node:path";

function unquote(value: string): string {
  let v = value.trim();
  for (let i = 0; i < 3; i++) {
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
      continue;
    }
    break;
  }
  return v.trim();
}

function loadDatabaseUrl(envPath: string): string | null {
  if (!fs.existsSync(envPath)) return null;
  const raw = fs.readFileSync(envPath, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^DATABASE_URL\s*=\s*(.*)$/);
    if (m) return unquote(m[1]);
  }
  return null;
}

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error("Usage: diagnose-db-url-safe.ts <env-file>...");
  process.exit(2);
}

for (const p of paths) {
  const abs = path.resolve(p);
  const v = loadDatabaseUrl(abs);
  if (v == null) {
    console.log(
      JSON.stringify({
        file: abs,
        exists: fs.existsSync(abs),
        status: "missing_key_or_file",
      })
    );
    continue;
  }
  const protocol = v.includes("://") ? v.split("://")[0] : "none";
  console.log(
    JSON.stringify({
      file: abs,
      exists: true,
      length: v.length,
      protocol,
      isPlaceholder: v === "[SENSITIVE]" || v === "SENSITIVE",
      isPostgres: /^postgres(ql)?:$/i.test(protocol + ":") || protocol === "postgresql" || protocol === "postgres",
      isPrisma: protocol.startsWith("prisma"),
    })
  );
}
