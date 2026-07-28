/**
 * Charge DATABASE_URL depuis un fichier .env (sans l'afficher),
 * puis importe Liquidarom.
 */
import fs from "node:fs";
import path from "node:path";

function unquote(value: string): string {
  let v = value.trim();
  // Vercel / dotenv : guillemets simples, doubles, ou échappés
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
    if (!m) continue;
    return unquote(m[1]);
  }
  throw new Error(`DATABASE_URL manquante dans ${envPath}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const envArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const envPath = path.resolve(envArg || ".env.production.local");
  if (!fs.existsSync(envPath)) throw new Error(`Env introuvable: ${envPath}`);

  const url = loadDatabaseUrl(envPath);
  process.env.DATABASE_URL = url;
  const protocol = url.includes("://") ? url.split("://", 1)[0] : "none";
  if (!url) throw new Error("DATABASE_URL vide après parsing");
  if (!/^postgres(ql)?:\/\//i.test(url) && !/^prisma(\+postgres(ql)?)?:\/\//i.test(url)) {
    throw new Error(`DATABASE_URL protocole non supporté: ${protocol}`);
  }

  const { PrismaClient } = await import("@prisma/client");
  const { importBundledLiquidarom } = await import("../lib/catalog/liquidarom-import");
  const prisma = new PrismaClient();

  console.log(
    `[liquidarom-prod] file=${path.basename(envPath)} mode=${dryRun ? "DRY-RUN" : "IMPORT"} protocol=${protocol}`
  );
  try {
    await prisma.$queryRaw`SELECT 1`;
    const before = await prisma.product.count();
    console.log(`[liquidarom-prod] products_before=${before}`);
    const stats = await importBundledLiquidarom(dryRun);
    const after = await prisma.product.count();
    const liquidarom = await prisma.product.count({
      where: { brand: { equals: "Liquidarom", mode: "insensitive" } },
    });
    console.log(JSON.stringify({ stats, products_after: after, liquidarom }, null, 2));
    if (stats.errors.length) {
      console.log("[errors]");
      stats.errors.slice(0, 20).forEach((e) => console.log(" -", e));
    }
    for (const q of [
      "Liquidarom",
      "Ice Cool",
      "Cassis Citron",
      "Mangue Passion",
      "Blackberry Raspberry",
    ]) {
      const n = await prisma.product.count({
        where: {
          isActive: true,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { brand: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
      });
      console.log(`[search] ${q} => ${n}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
