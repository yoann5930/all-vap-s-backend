/**
 * Cloud Vapor — Hellfest + Kung Freeze :
 * - crée gammes si absentes
 * - rattache produits au bon fabricant/gamme
 * - réimplante photos style e-tasty
 * - remplace logo fabricant (vrai logo fourni)
 * - ne touche PAS stock, covers de gamme existantes, Grand Taste City
 *
 * Usage:
 *   npx tsx scripts/implant-cloud-vapor-hellfest-kungfreeze.ts --dry-run
 *   npx tsx scripts/implant-cloud-vapor-hellfest-kungfreeze.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import "./load-env";
import prisma from "../lib/prisma";
import { normalizeProductImageToEtastyStyle } from "../lib/catalog/normalize-product-image";
import { slugify } from "../lib/utils";

const APPLY = process.argv.includes("--apply");
const SOURCE_ROOT = "C:\\Users\\ASUS\\Pictures\\cloud vapor";
const LOGO_SRC =
  "C:\\Users\\ASUS\\.cursor\\projects\\c-Users-ASUS-Documents-GitHub-all-vap-s-backend\\assets\\c__Users_ASUS_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_cloud_vapor-6885897d-4ca3-4381-8deb-aa6291a025ee.png";
const MEDIA_MFR = path.resolve("public/media/manufacturers/cloud-vapor");
const MEDIA_PRODUCTS = path.resolve("public/media/products/cloud-vapor");
const REPORT = path.resolve("data/rebuild/IMPLANT_CLOUD_VAPOR_HELLFEST_KUNGFREEZE.json");

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type RangeCfg = {
  key: "hellfest" | "kung-freeze";
  name: string;
  dir: string;
  format: "50ml";
  /** filename stem (without ext) → match tokens in product name */
  files: Array<{ file: string; flavor: string; aliases: string[] }>;
};

const RANGES: RangeCfg[] = [
  {
    key: "hellfest",
    name: "Hellfest",
    dir: path.join(SOURCE_ROOT, "hellfest"),
    format: "50ml",
    files: [
      { file: "blue rasphell-50ml.webp", flavor: "blue-rasphell", aliases: ["blue-rasphell", "blue-rasp", "rasphell"] },
      { file: "cherry devil-50ml.webp", flavor: "cherry-devil", aliases: ["cherry-devil", "cherry"] },
      { file: "dragon blast-50ml.webp", flavor: "dragon-blast", aliases: ["dragon-blast"] },
    ],
  },
  {
    key: "kung-freeze",
    name: "Kung Freeze",
    dir: path.join(SOURCE_ROOT, "kung freeze"),
    format: "50ml",
    files: [
      { file: "black-50ml.webp", flavor: "black", aliases: ["black"] },
      { file: "dragon-50ml.webp", flavor: "dragon", aliases: ["dragon"] },
      { file: "midnight-50ml.webp", flavor: "midnight", aliases: ["midnight"] },
      { file: "red-50ml.webp", flavor: "red", aliases: ["red"] },
      { file: "sunlight-50ml.webp", flavor: "sunlight", aliases: ["sunlight"] },
      { file: "sunrise-50ml.webp", flavor: "sunrise", aliases: ["sunrise"] },
      { file: "sunset-50ml.webp", flavor: "sunset", aliases: ["sunset", "sunsef"] },
      // bloodmon : PAS de match sûr (produit Dark ?) → skip volontaire
    ],
  },
];

function scoreProduct(productName: string, aliases: string[], rangeKey: string) {
  const n = norm(productName);
  if (!n.includes(norm(rangeKey.replace(/-/g, " "))) && !n.includes(rangeKey.replace(/-/g, ""))) {
    // kung freeze / hellfest must appear OR cloud vapor + flavor strong
    if (rangeKey === "kung-freeze" && !/kung/.test(n)) return 0;
    if (rangeKey === "hellfest" && !/hellfest/.test(n)) return 0;
  }
  // reject wrong formats
  if (/\b30\s*ml\b|\bconcentre|\bconcentré/.test(productName.toLowerCase())) return 0;
  if (/\b100\s*ml\b/.test(productName.toLowerCase())) return 0;

  let best = 0;
  for (const a of aliases) {
    const al = norm(a);
    if (!al) continue;
    if (n === al || n.endsWith("-" + al) || n.includes("-" + al + "-") || n.includes(al)) {
      // prefer exact flavor token presence
      const tokens = n.split("-");
      if (tokens.includes(al) || n.includes(al)) best = Math.max(best, al.length >= 5 ? 0.95 : 0.8);
    }
  }
  // avoid dragon matching dragon-blast wrongly across ranges — handled by range filter
  return best;
}

async function ensureBrandAndRange(manufacturerId: string, rangeName: string, rangeSlug: string) {
  let brand = await prisma.brand.findFirst({
    where: {
      manufacturerId,
      OR: [{ slug: rangeSlug }, { name: { equals: rangeName, mode: "insensitive" } }],
    },
  });
  if (!brand) {
    // fallback: brand named like manufacturer line
    brand = await prisma.brand.findFirst({
      where: { manufacturerId, slug: "cloud-vapor" },
    });
  }
  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: "Cloud Vapor",
        slug: "cloud-vapor",
        manufacturerId,
        status: "verifie",
        isActive: true,
      },
    });
  }

  let range = await prisma.productRange.findFirst({
    where: {
      manufacturerId,
      OR: [{ slug: rangeSlug }, { name: { equals: rangeName, mode: "insensitive" } }],
    },
  });
  if (!range) {
    range = await prisma.productRange.create({
      data: {
        name: rangeName,
        slug: rangeSlug,
        brandId: brand.id,
        manufacturerId,
        formatCodes: ["50ml"],
        status: "verifie",
        verificationStatus: "OFFICIAL_CONFIRMED",
        catalogVisible: true,
        isActive: true,
        masterId: `RNG-cloud_vapor-${rangeSlug.replace(/-/g, "_")}`,
      },
    });
  } else if (APPLY) {
    range = await prisma.productRange.update({
      where: { id: range.id },
      data: {
        manufacturerId,
        catalogVisible: true,
        isActive: true,
        status: "verifie",
        verificationStatus: "OFFICIAL_CONFIRMED",
        formatCodes: range.formatCodes?.length ? range.formatCodes : ["50ml"],
      },
    });
  }
  return { brand, range };
}

async function replaceManufacturerLogo() {
  const result: any = { skipped: false };
  if (!fs.existsSync(LOGO_SRC)) {
    result.skipped = true;
    result.reason = "logo_source_missing";
    return result;
  }
  fs.mkdirSync(MEDIA_MFR, { recursive: true });
  const dest = path.join(MEDIA_MFR, "logo.webp");
  const backup = path.join(MEDIA_MFR, `logo.backup-${Date.now()}.webp`);
  if (fs.existsSync(dest)) {
    fs.copyFileSync(dest, backup);
    result.backup = backup;
  }
  // Normalize to clean webp, keep transparency if any, white bg ok for logo.webp
  const buf = await sharp(LOGO_SRC)
    .rotate()
    .resize(800, 800, { fit: "inside", withoutEnlargement: false })
    .webp({ quality: 95, effort: 5 })
    .toBuffer();
  // Also produce on-dark: invert-ish not needed — place logo on transparent; for dark UI use same if black text on transparent fails.
  // Create logo-on-dark as white silhouette alternative? User gave black-on-white official logo — keep faithful on white canvas.
  if (APPLY) {
    fs.writeFileSync(dest, buf);
    // logo-on-dark: composite black logo onto transparent is fine; many UIs use logo.webp on cards.
    const onDark = path.join(MEDIA_MFR, "logo-on-dark.webp");
    // Keep same asset for now (official mark), UI falls back.
    fs.writeFileSync(onDark, buf);
  }
  result.dest = "/media/manufacturers/cloud-vapor/logo.webp";
  result.bytes = buf.length;
  return result;
}

async function main() {
  const mfr = await prisma.manufacturer.findFirst({ where: { slug: "cloud-vapor" } });
  if (!mfr) throw new Error("cloud-vapor manufacturer missing");

  const aClasser = await prisma.productRange.findFirst({
    where: { manufacturerId: mfr.id, slug: "a-classer" },
  });

  const report: any = {
    date: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    logo: null as any,
    implanted: [] as any[],
    skippedFiles: [] as any[],
    notes: [
      "stock non modifié",
      "covers de gamme non inventées / non touchées",
      "bloodmon.webp ignoré (doute Dark)",
      "Call of Vape / Grand Taste City hors scope de ce script",
    ],
  };

  report.logo = await replaceManufacturerLogo();
  console.log("Logo:", report.logo);

  const allCloud = await prisma.product.findMany({
    where: { manufacturerId: mfr.id },
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      imageStatus: true,
      stock: true,
      range: true,
      rangeId: true,
      productFamily: true,
      productType: true,
      visibleOnline: true,
      sumupProductId: true,
      barcode: true,
    },
  });

  for (const cfg of RANGES) {
    const { range } = await ensureBrandAndRange(mfr.id, cfg.name, cfg.key);
    console.log(`\nRange ${cfg.name} id=${range.id}`);

    for (const entry of cfg.files) {
      const src = path.join(cfg.dir, entry.file);
      if (!fs.existsSync(src)) {
        report.skippedFiles.push({ file: entry.file, reason: "missing_file" });
        continue;
      }

      const scored = allCloud
        .map((p) => ({ p, score: scoreProduct(p.name, entry.aliases, cfg.key) }))
        .filter((x) => x.score >= 0.75)
        .sort((a, b) => b.score - a.score);

      // Prefer SumUp + stock presence for keeper among matches
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const as = (a.p.sumupProductId ? 10 : 0) + (a.p.stock > 0 ? 5 : 0) + (a.p.visibleOnline ? 1 : 0);
        const bs = (b.p.sumupProductId ? 10 : 0) + (b.p.stock > 0 ? 5 : 0) + (b.p.visibleOnline ? 1 : 0);
        return bs - as;
      });

      if (!scored.length) {
        report.skippedFiles.push({
          range: cfg.key,
          file: entry.file,
          flavor: entry.flavor,
          reason: "no_product_match",
        });
        continue;
      }

      // Link all strong matches (>=0.9) else top1 — but only same flavor
      const targets = scored.filter((x) => x.score >= 0.9);
      const list = (targets.length ? targets : scored.slice(0, 1)).map((x) => x.p);
      // If multiple, keep SumUp ones; quarantine non-sumup duplicates later? For now attach photo to all sumup matches; non-sumup get photo too but we prefer one primary.
      const primary =
        list.find((p) => p.sumupProductId) ||
        list.find((p) => p.stock > 0) ||
        list[0];

      const outRel = path.join(cfg.key, cfg.format, `${entry.flavor}.webp`);
      const outPath = path.join(MEDIA_PRODUCTS, outRel);
      const publicUrl = `/media/products/cloud-vapor/${outRel.split(path.sep).join("/")}`;

      if (APPLY) {
        await normalizeProductImageToEtastyStyle({
          inputBuffer: fs.readFileSync(src),
          outPath,
          flavorHint: `${entry.flavor} ${cfg.name} cloud vapor ${primary.name}`,
          keepNativeFruits: false,
        });

        for (const t of list) {
          // Don't overwrite stock
          await prisma.product.update({
            where: { id: t.id },
            data: {
              manufacturerId: mfr.id,
              rangeId: range.id,
              range: cfg.name,
              brand: "Cloud Vapor",
              productType: t.productType || "50ml",
              imageUrl: publicUrl,
              imageStatus: "official",
              visibleOnline: true,
              isActive: true,
              catalogStatus: "valide",
              importAnomaly: null,
              // if was on a-classer, moved
            },
          });
          const img = await prisma.productImage.findFirst({
            where: { productId: t.id, sortOrder: 0 },
          });
          if (img) {
            await prisma.productImage.update({
              where: { id: img.id },
              data: { url: publicUrl, status: "official" },
            });
          } else {
            await prisma.productImage.create({
              data: {
                productId: t.id,
                url: publicUrl,
                status: "official",
                sortOrder: 0,
                alt: t.name,
              },
            });
          }
        }
      }

      report.implanted.push({
        hierarchy: `Cloud Vapor → ${cfg.name} → ${entry.flavor} 50ml`,
        file: entry.file,
        publicUrl,
        primary: primary.name,
        stockPreserved: list.map((p) => ({ id: p.id, name: p.name, stock: p.stock })),
        linked: list.map((p) => ({
          id: p.id,
          name: p.name,
          score: scored.find((s) => s.p.id === p.id)?.score,
          stock: p.stock,
        })),
      });
      console.log(
        `${APPLY ? "[ok]" : "[dry]"} Cloud Vapor → ${cfg.key} → ${entry.flavor} → ${list.length} produit(s)`,
      );
    }

    // Note bloodmon skip for kung freeze
    if (cfg.key === "kung-freeze") {
      report.skippedFiles.push({
        range: "kung-freeze",
        file: "bloodmon-50ml.webp",
        reason: "doute_match_dark_ou_autre",
      });
    }
  }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        implanted: report.implanted.length,
        skipped: report.skippedFiles,
        logo: report.logo?.dest,
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
