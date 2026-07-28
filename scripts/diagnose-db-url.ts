/**
 * Diagnostique DATABASE_URL sans afficher de secret.
 */
import fs from "node:fs";

const envPath = process.argv[2] || ".env.production.local";
const raw = fs.readFileSync(envPath, "utf8");
const m = raw.match(/^DATABASE_URL=(.*)$/m);
if (!m) {
  console.log(JSON.stringify({ ok: false, reason: "missing" }));
  process.exit(1);
}
let v = m[1].trim();
if (
  (v.startsWith('"') && v.endsWith('"')) ||
  (v.startsWith("'") && v.endsWith("'"))
) {
  v = v.slice(1, -1);
}
// Déquote éventuel double-encodage Vercel
if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);

const protocol = v.includes("://") ? v.split("://")[0] : "none";
console.log(
  JSON.stringify({
    ok: true,
    length: v.length,
    protocol,
    isPostgres: protocol === "postgresql" || protocol === "postgres",
    isPrisma: protocol === "prisma",
    empty: v.length === 0,
  })
);
