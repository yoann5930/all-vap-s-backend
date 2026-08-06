/**
 * Fix Kuix : uniquement e-liquides 50 ml (pas pods / batteries).
 * Photos depuis catalogue distributeur O'jLab / ecigplanete (sources LiquideLab).
 * Noms alignés SumUp + officiel, sync stock SumUp.
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";
import { normalizeProductImageToEtastyStyle } from "../lib/catalog/normalize-product-image";
import { resolveEn13, upsertEn13InDescription } from "../lib/catalog/en13";
import { evaluateEliquidePublishGate } from "../lib/catalog/official-sumup-policy";
import { connectSumUpStock } from "../lib/sumup/stock-connect";

const MEDIA_DIR = path.resolve("public/media/products/liquide-lab/kuix/50ml");
const REPORT = path.resolve("data/rebuild/RAPPORT_KUIX_50ML.json");

/** Catalogue Kuix 50 ml (8 réf. SumUp) — photos packshot distributeur O'jLab (même SKU). */
const OFFICIAL_50ML: Array<{
  slug: string;
  match: RegExp;
  imageUrls: string[];
  /** URL page catalogue source photo (preuve, pas invention) */
  imageSourceUrl: string;
}> = [
  {
    slug: "ananas",
    match: /ananas/i,
    imageSourceUrl: "https://www.ecigplanete.com/fr/2711-e-liquides-kuix",
    imageUrls: [
      "https://www.ecigplanete.com/45589-large_default/ananas-50ml-kuix.jpg",
      "https://www.ecigplanete.com/45589-thickbox_default/ananas-50ml-kuix.jpg",
    ],
  },
  {
    slug: "bluerazz",
    match: /bluerazz|blue\s*razz|blurazz/i,
    imageSourceUrl: "https://www.ecigplanete.com/fr/2711-e-liquides-kuix",
    imageUrls: [
      "https://www.ecigplanete.com/45582-large_default/blurazz-50ml-kuix.jpg",
      "https://www.ecigplanete.com/45582-thickbox_default/blurazz-50ml-kuix.jpg",
    ],
  },
  {
    slug: "bubblegum-pasteque",
    match: /bubble\s*gum\s*past[eè]que|past[eè]que.*bubble/i,
    imageSourceUrl: "https://www.ecigplanete.com/fr/2711-e-liquides-kuix",
    imageUrls: [
      "https://www.ecigplanete.com/45588-large_default/bubblegum-pasteque-50ml-kuix.jpg",
      "https://www.ecigplanete.com/45588-thickbox_default/bubblegum-pasteque-50ml-kuix.jpg",
    ],
  },
  {
    slug: "cassis-red-fruits",
    match: /cassis\s*red\s*fruits|cassis.*red/i,
    imageSourceUrl: "https://www.ecigplanete.com/fr/2711-e-liquides-kuix",
    imageUrls: [
      "https://www.ecigplanete.com/45587-large_default/cassis-red-fruits-50ml-kuix.jpg",
      "https://www.ecigplanete.com/45587-thickbox_default/cassis-red-fruits-50ml-kuix.jpg",
    ],
  },
  {
    slug: "fruits-rouges",
    match: /fruits?\s*rouges/i,
    imageSourceUrl: "https://www.ecigplanete.com/fr/2711-e-liquides-kuix",
    imageUrls: [
      "https://www.ecigplanete.com/45586-large_default/fruits-rouges-50ml-kuix.jpg",
      "https://vapot33.fr/wp-content/uploads/2026/05/DUMOE7FR404.jpg",
    ],
  },
  {
    slug: "limonade-citron-vert",
    match: /limonade\s*citron\s*vert/i,
    imageSourceUrl: "https://www.ecigplanete.com/fr/2711-e-liquides-kuix",
    imageUrls: [
      "https://www.ecigplanete.com/45585-large_default/limonade-citron-vert-50ml-kuix.jpg",
      "https://www.ecigplanete.com/45585-thickbox_default/limonade-citron-vert-50ml-kuix.jpg",
    ],
  },
  {
    slug: "raisin-bubble-gum",
    match: /raisin\s*bubble\s*gum/i,
    imageSourceUrl: "https://www.ecigplanete.com/fr/2711-e-liquides-kuix",
    imageUrls: [
      "https://www.ecigplanete.com/45584-large_default/raisin-bubble-gum-50ml-kuix.jpg",
      "https://www.ecigplanete.com/45584-thickbox_default/raisin-bubble-gum-50ml-kuix.jpg",
    ],
  },
  {
    slug: "tropical",
    match: /tropical/i,
    imageSourceUrl: "https://www.ecigplanete.com/fr/2711-e-liquides-kuix",
    imageUrls: [
      "https://www.ecigplanete.com/45583-large_default/tropical-50ml-kuix.jpg",
      "https://evapsaveurs.fr/1056-superlarge_default/eliquide-tropical-kuix-liquidelab-50ml.jpg",
    ],
  },
];

function isKuix50ml(name: string): boolean {
  return /kuix/i.test(name) && /50\s*ml/i.test(name) && !/\b(10|20)\s*mg\b/i.test(name);
}

function isKuixPodOrBattery(name: string): boolean {
  if (!/kuix/i.test(name)) return false;
  if (/batterie|battery/i.test(name)) return true;
  if (/\b(10|20)\s*mg\b/i.test(name)) return true;
  return false;
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*,*/*" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5000) return null;
    return buf;
  } catch {
    return null;
  }
}

async function resolveOfficialImage(entry: (typeof OFFICIAL_50ML)[number]): Promise<string | null> {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const outPath = path.join(MEDIA_DIR, `${entry.slug}.webp`);
  const publicUrl = `/media/products/liquide-lab/kuix/50ml/${entry.slug}.webp`;

  for (const imgUrl of entry.imageUrls) {
    const buf = await downloadImage(imgUrl);
    if (!buf) {
      console.log("img_fail", entry.slug, imgUrl.slice(0, 90));
      continue;
    }
    try {
      await normalizeProductImageToEtastyStyle({
        inputBuffer: buf,
        outPath,
        flavorHint: `${entry.slug} kuix liquide-lab 50ml`,
        // Détourage rembg + fond noir + cercle (style e-tasty).
        // Fruits décor off : props _fruit-props trop auréolés (white spots).
        keepNativeFruits: false,
        useRembg: true,
        skipFruitOverlays: true,
      });
      if (fs.existsSync(outPath)) {
        console.log("photo_ok", entry.slug, imgUrl.slice(0, 90));
        return publicUrl;
      }
    } catch (e) {
      console.log("norm_fail", entry.slug, String(e).slice(0, 120));
    }
  }

  return null;
}

async function main() {
  const manufacturer = await prisma.manufacturer.findUnique({ where: { slug: "liquide-lab" } });
  const range = await prisma.productRange.findFirst({
    where: { slug: "kuix", manufacturerId: manufacturer?.id },
  });
  const brand = await prisma.brand.findFirst({
    where: { slug: "liquide-lab" },
  });
  if (!manufacturer || !range || !brand) {
    throw new Error("Liquide Lab / Kuix manquant — lancer catalog:liquidelab d'abord");
  }

  const allKuix = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "Kuix", mode: "insensitive" } },
        { productFamily: "LIQUIDELAB_KUIX" },
        { rangeId: range.id },
      ],
    },
  });

  const unpublishedPods: string[] = [];
  const published50: Array<Record<string, unknown>> = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  // 1) Retirer pods / batteries de la vitrine e-liquides Kuix
  for (const p of allKuix) {
    if (!isKuixPodOrBattery(p.name)) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        visibleOnline: false,
        catalogStatus: "a_verifier",
        category: /batterie/i.test(p.name) ? "materiel" : "pods",
        productType: null,
        volumeMl: null,
        importAnomaly: "kuix_pod_ou_batterie_hors_gamme_eliquide_50ml",
        rangeId: range.id,
        manufacturerId: manufacturer.id,
        brandId: brand.id,
        brand: "Liquide Lab",
        range: "Kuix",
        productFamily: "LIQUIDELAB_KUIX",
      },
    });
    unpublishedPods.push(p.name);
  }

  // 2) Publier les 8×50 ml : nom = SumUp (pas inventé) + photos packshot documentées
  for (const entry of OFFICIAL_50ML) {
    const product = allKuix.find((p) => {
      const label = `${p.sumupName || ""} ${p.name}`;
      return (
        Boolean(p.sumupProductId) &&
        (isKuix50ml(p.name) || isKuix50ml(p.sumupName || "")) &&
        entry.match.test(label)
      );
    });
    if (!product) {
      skipped.push({ name: entry.slug, reason: "sumup_50ml_introuvable" });
      continue;
    }

    const sumupLabel = (product.sumupName || product.name).replace(/\s+/g, " ").trim();
    const imageUrl = await resolveOfficialImage(entry);
    const en13 = resolveEn13({
      officialBarcode: null,
      existingBarcode: product.barcode,
      description: product.description,
    });
    const description = upsertEn13InDescription(
      product.description ||
        `E-liquide Kuix ${sumupLabel}. PG/VG 50/50. Fabrication Liquide Lab (Belgique). Source photo : ${entry.imageSourceUrl}`,
      en13.barcode
    );

    const gate = evaluateEliquidePublishGate({
      category: "e-liquides",
      productType: "50ml",
      volumeMl: 50,
      name: sumupLabel,
      sumupName: sumupLabel,
      sumupProductId: product.sumupProductId,
      imageStatus: imageUrl ? "official" : product.imageStatus || "pending",
      imageUrl: imageUrl || product.imageUrl,
      priceCents: product.priceCents,
    });

    await prisma.product.update({
      where: { id: product.id },
      data: {
        name: sumupLabel,
        sumupName: sumupLabel,
        description,
        barcode: en13.barcode || product.barcode,
        brand: "Liquide Lab",
        range: "Kuix",
        productFamily: "LIQUIDELAB_KUIX",
        category: "e-liquides",
        productType: "50ml",
        volumeMl: 50,
        manufacturerId: manufacturer.id,
        brandId: brand.id,
        rangeId: range.id,
        isActive: true,
        visibleOnline: gate.canPublishOnline,
        catalogStatus: gate.canPublishOnline ? "valide" : "a_verifier",
        imageUrl: imageUrl || product.imageUrl,
        imageStatus: imageUrl ? "official" : product.imageStatus || "pending",
        importAnomaly: gate.canPublishOnline
          ? null
          : gate.anomalies.join("|") || "photo_officielle_a_completer",
        promotion10mlEligible: false,
        sumupLastSync: new Date(),
      },
    });

    if (imageUrl) {
      await prisma.productImage.deleteMany({ where: { productId: product.id } });
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: imageUrl,
          status: "official",
          sortOrder: 0,
          alt: sumupLabel,
        },
      });
    }

    published50.push({
      id: product.id,
      sumupName: sumupLabel,
      displayName: sumupLabel,
      sumupProductId: product.sumupProductId,
      barcode: en13.barcode || product.barcode,
      imageUrl,
      imageSourceUrl: entry.imageSourceUrl,
      visibleOnline: gate.canPublishOnline,
      priceCents: product.priceCents,
    });
  }

  // 3) Sync stock SumUp (miroir + CSV + tx)
  const stock = await connectSumUpStock({ forceTransactions: true });

  const report = {
    date: new Date().toISOString(),
    published50Count: published50.length,
    unpublishedPodsCount: unpublishedPods.length,
    published50,
    unpublishedPods,
    skipped,
    stock: {
      ok: stock.ok,
      message: stock.message,
      mirror: stock.mirror,
      csv: stock.csvInbox,
      salesApplied: stock.transactions?.salesApplied,
    },
    urls: [
      "http://localhost:3000/gammes/kuix?fabricant=liquide-lab",
      "http://localhost:3000/fabricants/liquide-lab",
    ],
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    ok: true,
    published50: published50.length,
    unpublishedPods: unpublishedPods.length,
    skipped,
    photos: published50.filter((p) => p.imageUrl).length,
    stockMessage: stock.message,
    report: REPORT,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
