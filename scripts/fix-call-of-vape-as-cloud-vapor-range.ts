/**
 * Consolide Call of Vape comme gamme Cloud Vapor :
 * - tous les produits Call of Vape → manufacturer cloud-vapor + range call-of-vape
 * - noms Fabricant — Gamme — Produit
 * - ne colle PAS la photo 100ml sur Zombie 50ml / concentrés 30ml
 * - stock non modifié
 *
 * Usage:
 *   npx tsx scripts/fix-call-of-vape-as-cloud-vapor-range.ts --dry-run
 *   npx tsx scripts/fix-call-of-vape-as-cloud-vapor-range.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";

const APPLY = process.argv.includes("--apply");
const REPORT = path.resolve("data/rebuild/FIX_CALL_OF_VAPE_RANGE.json");

function flavorFromName(name: string): string | null {
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const flavors = [
    "assault",
    "blackout",
    "crimson",
    "ghost",
    "operator",
    "prestige",
    "scout",
    "support",
    "zombie",
  ];
  for (const f of flavors) {
    if (n.includes(f)) return f.charAt(0).toUpperCase() + f.slice(1);
  }
  return null;
}

function detectFormat(name: string, productType: string | null): { label: string; code: string; isConcentrate: boolean } {
  const n = `${name} ${productType || ""}`.toLowerCase();
  const isConcentrate = /concentr/.test(n);
  if (/\b30\s*ml\b/.test(n) || isConcentrate) {
    return { label: isConcentrate ? "Concentré 30 ml" : "30 ml", code: "30ml", isConcentrate };
  }
  if (/\b100\s*ml\b/.test(n) || productType === "100ml") {
    return { label: "100 ml", code: "100ml", isConcentrate: false };
  }
  if (/\b50\s*ml\b/.test(n) || productType === "50ml") {
    return { label: "50 ml", code: "50ml", isConcentrate: false };
  }
  return { label: "50 ml", code: "50ml", isConcentrate: false };
}

async function main() {
  const mfr = await prisma.manufacturer.findFirst({ where: { slug: "cloud-vapor" } });
  if (!mfr) throw new Error("cloud-vapor missing");

  let brand = await prisma.brand.findFirst({
    where: {
      OR: [{ slug: "cloud-vapor" }, { manufacturerId: mfr.id, name: { equals: "Cloud Vapor", mode: "insensitive" } }],
    },
  });
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: "Cloud Vapor",
        slug: "cloud-vapor",
        manufacturerId: mfr.id,
        status: "verifie",
        isActive: true,
      },
    });
  }

  let range = await prisma.productRange.findFirst({
    where: { slug: "call-of-vape", manufacturerId: mfr.id },
  });
  if (!range) throw new Error("call-of-vape range missing");

  const report: any = {
    date: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    hierarchy: "Cloud Vapor → Call of Vape → produit",
    updated: [] as any[],
  };

  if (APPLY) {
    range = await prisma.productRange.update({
      where: { id: range.id },
      data: {
        name: "Call of Vape",
        manufacturerId: mfr.id,
        brandId: brand.id,
        catalogVisible: true,
        isActive: true,
        status: "verifie",
        verificationStatus: "OFFICIAL_CONFIRMED",
        formatCodes: ["100ml", "50ml", "30ml"],
      },
    });
  }

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { rangeId: range.id },
        { name: { contains: "Call of Vape", mode: "insensitive" } },
        { name: { contains: "call of vape", mode: "insensitive" } },
        { range: { equals: "Call of Vape", mode: "insensitive" } },
        { productFamily: "CALL_OF_VAPE" },
      ],
      manufacturerId: mfr.id,
    },
  });

  for (const p of products) {
    const flavor = flavorFromName(p.name);
    if (!flavor) {
      report.updated.push({ id: p.id, name: p.name, action: "skip_no_flavor" });
      continue;
    }
    const fmt = detectFormat(p.name, p.productType);
    const cleanName = `Cloud Vapor — Call of Vape — ${flavor}${fmt.isConcentrate ? " Concentré" : ""} ${fmt.label.replace("Concentré ", "")}`;
    // Normalize: "Cloud Vapor — Call of Vape — Assault Concentré 30 ml"
    const finalName = fmt.isConcentrate
      ? `Cloud Vapor — Call of Vape — ${flavor} Concentré 30 ml`
      : `Cloud Vapor — Call of Vape — ${flavor} ${fmt.label}`;

    const alreadyOk =
      p.name === finalName &&
      p.rangeId === range.id &&
      p.range === "Call of Vape" &&
      p.brand === "Cloud Vapor" &&
      p.manufacturerId === mfr.id;

    report.updated.push({
      id: p.id,
      from: p.name,
      to: finalName,
      stock: p.stock,
      format: fmt.code,
      imageUrl: p.imageUrl,
      alreadyOk,
    });

    console.log(
      `${APPLY ? "[ok]" : "[dry]"} ${p.name} => ${finalName} (stock=${p.stock}, img=${!!p.imageUrl})`,
    );

    if (!APPLY || alreadyOk) continue;

    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: finalName,
        manufacturerId: mfr.id,
        brandId: brand.id,
        brand: "Cloud Vapor",
        rangeId: range.id,
        range: "Call of Vape",
        productFamily: "CALL_OF_VAPE",
        productType: fmt.code,
        // keep visibility: 100ml with photo stay online; others stay as-is unless we want concentrates offline
        visibleOnline: p.imageUrl ? true : p.visibleOnline,
        isActive: true,
        catalogStatus: p.imageUrl ? "valide" : p.catalogStatus,
        // stock INTENTIONALLY untouched
      },
    });
  }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        count: report.updated.length,
        report: REPORT,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
