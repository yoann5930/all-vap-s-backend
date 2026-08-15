/**
 * Photos officielles Twenty (e.Tasty 20 ml) → style e-tasty + cover de gamme.
 * Sources : packshots pro.e-tasty.fr (EAN officiels). Pas d'invention.
 *
 * npx tsx scripts/normalize-twenty-photos.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { ensureProductImageEtastyStyle } from "../lib/catalog/normalize-product-image";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const OFFICIAL_BY_EAN: Record<
  string,
  { flavor: string; imageUrl: string; productUrl: string }
> = {
  "3701418867090": {
    flavor: "Double Pêche",
    imageUrl: "https://pro.e-tasty.fr/9888-large_default/double-peche-20ml.jpg",
    productUrl:
      "https://pro.e-tasty.fr/flacon-20ml/3557-7986-double-peche-20ml-3701418867090.html",
  },
  "3701418867083": {
    flavor: "Fruit Du Dragon Cerise",
    imageUrl: "https://pro.e-tasty.fr/9890-large_default/fruit-du-dragon-cerise-20ml-.jpg",
    productUrl:
      "https://pro.e-tasty.fr/flacon-20ml/3558-7987-fruit-du-dragon-cerise-20ml--3701418867083.html",
  },
  "3701418867106": {
    flavor: "Fruits Rouges",
    imageUrl: "https://pro.e-tasty.fr/9897-large_default/fruits-rouges-20ml.jpg",
    productUrl:
      "https://pro.e-tasty.fr/flacon-20ml/3561-7990-fruits-rouges-20ml-3701418867106.html",
  },
  "3701418867076": {
    flavor: "Limonade Citron Cassis",
    imageUrl: "https://pro.e-tasty.fr/9892-large_default/limonade-citron-cassis-20ml-.jpg",
    productUrl:
      "https://pro.e-tasty.fr/flacon-20ml/3559-7988-limonade-citron-cassis-20ml--3701418867076.html",
  },
  "3701418867113": {
    flavor: "Menthe Polaire",
    imageUrl: "https://pro.e-tasty.fr/9894-large_default/menthe-polaire-20ml.jpg",
    productUrl:
      "https://pro.e-tasty.fr/flacon-20ml/3560-7989-menthe-polaire-20ml-3701418867113.html",
  },
};

const RANGE_COVER_URL =
  "https://pro.e-tasty.fr/modules/ps_imageslider/images/3bd950e4320127cadfa4e160a13299627fc8c4e3_TWENTY-Banniere-Site-Home.png";

function loadEnvFile(file: string): Record<string, string> {
  const raw = fs.readFileSync(file, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function extractPostgresUrl(raw: string): string {
  let v = raw.trim().replace(/^\uFEFF/, "");
  const embedded = v.match(/postgres(?:ql)?:\/\/\S+/i);
  if (embedded) return embedded[0].replace(/[.,;]+$/, "");
  return v;
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AllVapsCatalogBot/1.0 (official packshot mirror; read-only)" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 800 ? buf : null;
  } catch {
    return null;
  }
}

async function implantRangeCover(input: Buffer, outPath: string) {
  const W = 1280;
  const H = 800;
  const bg = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 11, g: 16, b: 22 } },
  })
    .png()
    .toBuffer();
  const cover = await sharp(input)
    .rotate()
    .resize(W, H, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(bg)
    .composite([{ input: cover, left: 0, top: 0 }])
    .webp({ quality: 90, effort: 5 })
    .toFile(outPath);
}

async function main() {
  const env = loadEnvFile(path.join(REPO_ROOT, ".env.render.audit"));
  const prisma = new PrismaClient({
    datasources: { db: { url: extractPostgresUrl(env.DATABASE_URL || "") } },
    log: ["error"],
  });

  const report: Array<Record<string, unknown>> = [];
  try {
    const db = await prisma.$queryRaw<Array<{ current_database: string }>>`
      SELECT current_database() AS current_database
    `;
    if (db[0]?.current_database !== "all_vaps_db") {
      throw new Error("Base inattendue");
    }

    const coverPath = path.join(
      REPO_ROOT,
      "public/media/manufacturers/e-tasty/ranges/twenty.webp"
    );
    const coverBuf = await download(RANGE_COVER_URL);
    if (coverBuf) {
      await implantRangeCover(coverBuf, coverPath);
      report.push({
        kind: "range_cover",
        ok: true,
        path: "/media/manufacturers/e-tasty/ranges/twenty.webp",
        sourceUrl: RANGE_COVER_URL,
        bytes: fs.statSync(coverPath).size,
      });
    } else {
      report.push({ kind: "range_cover", ok: false, error: "download_fail", sourceUrl: RANGE_COVER_URL });
    }

    const logoPath = path.join(REPO_ROOT, "public/media/manufacturers/e-tasty/logo.webp");
    report.push({
      kind: "manufacturer_logo",
      ok: fs.existsSync(logoPath) && fs.statSync(logoPath).size > 500,
      path: "/media/manufacturers/e-tasty/logo.webp",
    });

    for (const [ean, official] of Object.entries(OFFICIAL_BY_EAN)) {
      const product = await prisma.product.findFirst({
        where: { barcode: ean },
        include: { catalogImages: true },
      });
      if (!product) {
        report.push({ ean, flavor: official.flavor, ok: false, error: "product_missing" });
        continue;
      }

      const source =
        official.imageUrl.replace("large_default", "thickbox_default") || official.imageUrl;
      let publicUrl: string | null = null;
      try {
        publicUrl = await ensureProductImageEtastyStyle({
          sourceUrl: source,
          productName: product.name,
          brand: product.brand || "e.Tasty",
          manufacturerSlug: "e-tasty",
          rangeSlug: "twenty",
          format: "20ml",
          productSlug: product.slug,
        });
      } catch {
        try {
          publicUrl = await ensureProductImageEtastyStyle({
            sourceUrl: official.imageUrl,
            productName: product.name,
            brand: product.brand || "e.Tasty",
            manufacturerSlug: "e-tasty",
            rangeSlug: "twenty",
            format: "20ml",
            productSlug: product.slug,
          });
        } catch (e2) {
          report.push({
            ean,
            name: product.name,
            ok: false,
            error: String(e2),
            sourceUrl: official.imageUrl,
          });
          continue;
        }
      }

      const abs = path.join(REPO_ROOT, "public", publicUrl.replace(/^\//, ""));
      const fileOk = fs.existsSync(abs) && fs.statSync(abs).size > 1000;

      await prisma.product.update({
        where: { id: product.id },
        data: {
          imageUrl: publicUrl,
          imageStatus: fileOk ? "official" : product.imageStatus,
        },
      });

      const existing = product.catalogImages.find((i) => i.url === publicUrl);
      if (!existing && fileOk) {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url: publicUrl,
            status: "official",
            sortOrder: 0,
            alt: product.name,
          },
        });
      }

      report.push({
        ean,
        name: product.name,
        slug: product.slug,
        ok: fileOk,
        imageUrl: publicUrl,
        imageStatus: fileOk ? "official" : product.imageStatus,
        sourceUrl: official.productUrl,
        packshotUrl: official.imageUrl,
        bytes: fileOk ? fs.statSync(abs).size : 0,
        ui: {
          card: "ProductCard object-contain + sizes 50vw / 33vw / 280px",
          fiche: "galerie object-contain",
          preoptimized: publicUrl.startsWith("/media/products/"),
        },
      });
    }

    console.log(JSON.stringify({ ok: report.every((r) => r.ok !== false), report }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
