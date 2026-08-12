/**
 * Corrige les placements restants détectés par l'audit no-mix.
 * - Dark Kung Freeze → Cloud Vapor / Kung Freeze
 * - Vérifie Ice Cool X pas sur Ice Cool
 * - Ne touche pas stock / photos / covers
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";

const APPLY = process.argv.includes("--apply");
const REPORT = path.resolve("data/rebuild/FIX_NO_MIX_PLACEMENTS.json");

async function main() {
  const report: any = { mode: APPLY ? "apply" : "dry-run", fixes: [] as any[], checks: [] as any[] };

  const liquidarom = await prisma.manufacturer.findFirst({ where: { slug: "liquidarom" } });
  const cloud = await prisma.manufacturer.findFirst({ where: { slug: "cloud-vapor" } });
  if (!liquidarom || !cloud) throw new Error("mfr missing");

  const iceCool = await prisma.productRange.findFirst({
    where: { slug: "ice-cool", manufacturerId: liquidarom.id },
  });
  const iceCoolX = await prisma.productRange.findFirst({
    where: { slug: "ice-cool-x", manufacturerId: liquidarom.id },
  });
  const kung = await prisma.productRange.findFirst({
    where: { slug: "kung-freeze", manufacturerId: cloud.id },
  });
  if (!iceCool || !iceCoolX || !kung) throw new Error("ranges missing");

  // 1) Ice Cool X products wrongly on Ice Cool rangeId
  const xOnIce = await prisma.product.findMany({
    where: {
      manufacturerId: liquidarom.id,
      rangeId: iceCool.id,
      OR: [
        { name: { contains: "Ice Cool X", mode: "insensitive" } },
        { productFamily: "ICE_COOL_X" },
      ],
    },
  });
  for (const p of xOnIce) {
    report.fixes.push({ action: "move_ice_cool_x", from: p.name, toRange: "Ice Cool X", stock: p.stock });
    console.log(`${APPLY ? "[ok]" : "[dry]"} MOVE X off Ice Cool: ${p.name}`);
    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: {
          rangeId: iceCoolX.id,
          range: "Ice Cool X",
          productFamily: "ICE_COOL_X",
          brand: "Liquidarom",
          manufacturerId: liquidarom.id,
        },
      });
    }
  }

  // 2) Products named Ice Cool X but wrong rangeId
  const xWrong = await prisma.product.findMany({
    where: {
      manufacturerId: liquidarom.id,
      name: { contains: "Ice Cool X", mode: "insensitive" },
      NOT: { rangeId: iceCoolX.id },
    },
  });
  for (const p of xWrong) {
    report.fixes.push({ action: "attach_ice_cool_x", from: p.name, rangeId: p.rangeId, stock: p.stock });
    console.log(`${APPLY ? "[ok]" : "[dry]"} ATTACH Ice Cool X: ${p.name}`);
    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: {
          rangeId: iceCoolX.id,
          range: "Ice Cool X",
          productFamily: "ICE_COOL_X",
          brand: "Liquidarom",
          manufacturerId: liquidarom.id,
        },
      });
    }
  }

  // 3) Dark Kung Freeze
  const dark = await prisma.product.findMany({
    where: {
      manufacturerId: cloud.id,
      OR: [
        { name: { contains: "Dark", mode: "insensitive" }, AND: [{ name: { contains: "Kung", mode: "insensitive" } }] },
        { name: { contains: "bloodmon", mode: "insensitive" } },
      ],
    },
  });
  for (const p of dark) {
    const clean = "Cloud Vapor — Kung Freeze — Dark 50 ml";
    report.fixes.push({
      action: "attach_kung_freeze_dark",
      from: p.name,
      to: clean,
      stock: p.stock,
      note: "photo bloodmon NON collée (doute)",
    });
    console.log(`${APPLY ? "[ok]" : "[dry]"} KUNG Dark: ${p.name} => ${clean} (stock=${p.stock})`);
    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: {
          name: clean,
          manufacturerId: cloud.id,
          brand: "Cloud Vapor",
          rangeId: kung.id,
          range: "Kung Freeze",
          productType: "50ml",
          productFamily: "KUNG_FREEZE",
          // no photo from bloodmon until confirmed
          visibleOnline: false,
          isActive: true,
        },
      });
    }
  }

  // 4) Sanity checks after
  const checks = [
    {
      label: "liquidarom_on_cloud_ranges",
      where: {
        manufacturerId: liquidarom.id,
        range: { in: ["Call of Vape", "Hellfest", "Kung Freeze"] },
      },
    },
    {
      label: "cloud_on_liquidarom_ranges",
      where: {
        manufacturerId: cloud.id,
        range: { in: ["Ice Cool", "Ice Cool X", "Les Collègues", "Les Essentiels", "Replay"] },
      },
    },
    {
      label: "ice_cool_x_on_ice_cool_range",
      where: {
        rangeId: iceCool.id,
        OR: [{ name: { contains: "Ice Cool X", mode: "insensitive" } }, { productFamily: "ICE_COOL_X" }],
      },
    },
  ] as const;

  for (const c of checks) {
    const count = await prisma.product.count({ where: c.where as any });
    report.checks.push({ label: c.label, count });
    console.log(`CHECK ${c.label}=${count}`);
  }

  // Summary per folder expected
  const specs = [
    ["liquidarom", "ice-cool", "Ice Cool"],
    ["liquidarom", "ice-cool-x", "Ice Cool X"],
    ["liquidarom", "les-collegues", "Les Collègues"],
    ["liquidarom", "les-essentiels", "Les Essentiels"],
    ["liquidarom", "replay", "Replay"],
    ["cloud-vapor", "call-of-vape", "Call of Vape"],
    ["cloud-vapor", "hellfest", "Hellfest"],
    ["cloud-vapor", "kung-freeze", "Kung Freeze"],
  ] as const;

  for (const [mfrSlug, rangeSlug, rangeName] of specs) {
    const mfr = mfrSlug === "liquidarom" ? liquidarom : cloud;
    const range = await prisma.productRange.findFirst({
      where: { slug: rangeSlug, manufacturerId: mfr.id },
    });
    const count = range
      ? await prisma.product.count({
          where: { rangeId: range.id, manufacturerId: mfr.id },
        })
      : -1;
    const badMfr = range
      ? await prisma.product.count({
          where: { rangeId: range.id, NOT: { manufacturerId: mfr.id } },
        })
      : -1;
    report.checks.push({ label: `range:${rangeSlug}`, products: count, foreignMfr: badMfr, rangeName });
    console.log(`RANGE ${mfrSlug}→${rangeName}: products=${count} foreignMfr=${badMfr}`);
  }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ mode: report.mode, fixes: report.fixes.length, report: REPORT }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
