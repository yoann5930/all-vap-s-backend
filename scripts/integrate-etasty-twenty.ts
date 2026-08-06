/**
 * Intégration gamme Twenty (e.Tasty) + format 20 ml.
 *
 * Sources :
 * - catalogue officiel pro.e-tasty.fr (/91_twenty) via ETASTY_OFFICIAL_SCRAPE.json
 * - lignes SumUp locales (EAN / prix / stock / sumupProductId) — lecture seule
 *
 * Aucune écriture SumUp. Aucun changement graphique.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "../lib/prisma";

const MEDIA_ROOT = path.resolve("public/media/products/e-tasty/twenty/20ml");
const SCRAPE_PATH = path.resolve("data/rebuild/ETASTY_OFFICIAL_SCRAPE.json");
const REPORT_PATH = path.resolve("data/rebuild/RAPPORT_ETASTY_TWENTY.json");
const REPORT_MD = path.resolve("data/rebuild/RAPPORT_ETASTY_TWENTY.md");

/** Mapping EAN officiel → fiche Twenty 20 ml (extrait des URLs pro.e-tasty.fr). */
const OFFICIAL_BY_EAN: Record<
  string,
  { title: string; flavor: string; imageUrl: string; productUrl: string }
> = {
  "3701418867090": {
    title: "DOUBLE PECHE 20ML",
    flavor: "Double Pêche",
    imageUrl: "https://pro.e-tasty.fr/9888-large_default/double-peche-20ml.jpg",
    productUrl:
      "https://pro.e-tasty.fr/flacon-20ml/3557-7986-double-peche-20ml-3701418867090.html",
  },
  "3701418867083": {
    title: "FRUIT DU DRAGON - CERISE 20ML",
    flavor: "Fruit Du Dragon Cerise",
    imageUrl: "https://pro.e-tasty.fr/9890-large_default/fruit-du-dragon-cerise-20ml-.jpg",
    productUrl:
      "https://pro.e-tasty.fr/flacon-20ml/3558-7987-fruit-du-dragon-cerise-20ml--3701418867083.html",
  },
  "3701418867106": {
    title: "FRUITS ROUGES 20ML",
    flavor: "Fruits Rouges",
    imageUrl: "https://pro.e-tasty.fr/9897-large_default/fruits-rouges-20ml.jpg",
    productUrl:
      "https://pro.e-tasty.fr/flacon-20ml/3561-7990-fruits-rouges-20ml-3701418867106.html",
  },
  "3701418867076": {
    title: "LIMONADE CITRON - CASSIS 20ML",
    flavor: "Limonade Citron Cassis",
    imageUrl: "https://pro.e-tasty.fr/9892-large_default/limonade-citron-cassis-20ml-.jpg",
    productUrl:
      "https://pro.e-tasty.fr/flacon-20ml/3559-7988-limonade-citron-cassis-20ml--3701418867076.html",
  },
  "3701418867113": {
    title: "MENTHE POLAIRE 20ML",
    flavor: "Menthe Polaire",
    imageUrl: "https://pro.e-tasty.fr/9894-large_default/menthe-polaire-20ml.jpg",
    productUrl:
      "https://pro.e-tasty.fr/flacon-20ml/3560-7989-menthe-polaire-20ml-3701418867113.html",
  },
};

function slugify(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function displayName(flavor: string): string {
  return `${flavor} — Twenty — 20 ml`;
}

async function downloadOfficialImage(
  imageUrl: string,
  productSlug: string
): Promise<string | null> {
  try {
    fs.mkdirSync(MEDIA_ROOT, { recursive: true });
    const destRel = `/media/products/e-tasty/twenty/20ml/${productSlug}.webp`;
    const destAbs = path.resolve("public", destRel.replace(/^\//, ""));
    if (fs.existsSync(destAbs) && fs.statSync(destAbs).size > 1000) return destRel;

    const prefer = imageUrl
      .replace("large_default", "thickbox_default")
      .replace("home_default", "thickbox_default");
    let buf: Buffer | null = null;
    for (const u of [prefer, imageUrl]) {
      const res = await fetch(u, {
        headers: {
          "User-Agent": "AllVapsCatalogBot/1.0 (official packshot mirror; read-only)",
        },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) continue;
      const ab = await res.arrayBuffer();
      if (ab.byteLength < 800) continue;
      buf = Buffer.from(ab);
      break;
    }
    if (!buf) return null;

    await sharp(buf)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toFile(destAbs);
    return destRel;
  } catch {
    return null;
  }
}

function ensureReferentiel() {
  // Formats
  const fmtPath = path.resolve("data/referentiel/03_FORMATS.json");
  const fmt = JSON.parse(fs.readFileSync(fmtPath, "utf8"));
  if (!fmt.items.some((i: { code: string }) => i.code === "20ml")) {
    fmt.items.push({
      code: "20ml",
      label: "20 ml",
      ml: 20,
      status: "valide",
      sources: ["referentiel_standard", "gamme:RNG-e_tasty-twenty", "site_officiel_e_tasty"],
      productCountMaster: 5,
      productCountValides: 0,
      gammes: ["Twenty"],
    });
    fmt.items.sort((a: { ml: number }, b: { ml: number }) => a.ml - b.ml);
    fmt.total = fmt.items.length;
    fmt.date = new Date().toISOString();
    fs.writeFileSync(fmtPath, JSON.stringify(fmt, null, 2), "utf8");
  }

  // Gamme
  const gamPath = path.resolve("data/referentiel/02_GAMMES.json");
  const gam = JSON.parse(fs.readFileSync(gamPath, "utf8"));
  const id = "RNG-e_tasty-twenty";
  if (!gam.items.some((i: { id: string; slug: string }) => i.id === id || i.slug === "twenty")) {
    gam.items.push({
      id,
      nom: "Twenty",
      slug: "twenty",
      fabricant: "e.Tasty",
      fabricantSlug: "e-tasty",
      description: "Gamme Twenty (e.Tasty) — flacons 20 ml — stock SumUp All Vap's",
      site: "https://pro.e-tasty.fr/91_twenty",
      formatsDeclares: "20ml",
      formatCodes: ["20ml"],
      formatsStatus: "verifie",
      origine: "France",
      status: "partiel",
      statusSource: "SITE_OFFICIEL_PRO + SUMUP_EAN",
      anomalies: [],
    });
    gam.total = gam.items.length;
    gam.date = new Date().toISOString();
    fs.writeFileSync(gamPath, JSON.stringify(gam, null, 2), "utf8");
  }
}

async function main() {
  console.log("=== Intégration e.Tasty Twenty (20 ml) ===\n");
  ensureReferentiel();

  // 1) Format 20 ml
  await prisma.catalogFormat.upsert({
    where: { code: "20ml" },
    create: {
      code: "20ml",
      label: "20 ml",
      ml: 20,
      status: "valide",
      sortOrder: 20,
      isActive: true,
    },
    update: {
      label: "20 ml",
      ml: 20,
      status: "valide",
      sortOrder: 20,
      isActive: true,
    },
  });

  const manufacturer = await prisma.manufacturer.findUnique({ where: { slug: "e-tasty" } });
  const brand = await prisma.brand.findUnique({ where: { slug: "e-tasty" } });
  if (!manufacturer || !brand) {
    throw new Error("Fabricant/marque e-tasty absents — lancer d'abord integrate-etasty.ts");
  }

  const range = await prisma.productRange.upsert({
    where: {
      brandId_slug: { brandId: brand.id, slug: "twenty" },
    },
    create: {
      masterId: "RNG-e_tasty-twenty",
      name: "Twenty",
      slug: "twenty",
      brandId: brand.id,
      manufacturerId: manufacturer.id,
      formatCodes: ["20ml"],
      status: "partiel",
      sortOrder: 40,
      isActive: true,
    },
    update: {
      masterId: "RNG-e_tasty-twenty",
      name: "Twenty",
      manufacturerId: manufacturer.id,
      formatCodes: ["20ml"],
      status: "partiel",
      isActive: true,
    },
  });

  const report = {
    date: new Date().toISOString(),
    detected: 0,
    integrated: 0,
    published: 0,
    aVerifier: 0,
    photosAssociated: 0,
    eanAssociated: 0,
    sumupAssociated: 0,
    products: [] as Array<Record<string, unknown>>,
    errors: [] as string[],
  };

  const barcodes = Object.keys(OFFICIAL_BY_EAN);
  const products = await prisma.product.findMany({
    where: { barcode: { in: barcodes } },
    include: { variants: true, catalogImages: true, flavors: true },
  });

  report.detected = products.length;

  // Vérifie scrape officiel pour cohérence (non bloquant)
  if (fs.existsSync(SCRAPE_PATH)) {
    const scrape = JSON.parse(fs.readFileSync(SCRAPE_PATH, "utf8")) as {
      ranges: Array<{ requested: { path: string }; products: unknown[] }>;
    };
    const twenty = scrape.ranges.find((r) => r.requested.path === "/91_twenty");
    if (twenty && twenty.products.length !== 5) {
      report.errors.push(
        `Scrape officiel Twenty: ${twenty.products.length} produits (attendu 5)`
      );
    }
  }

  for (const ean of barcodes) {
    const official = OFFICIAL_BY_EAN[ean]!;
    const p = products.find((x) => x.barcode === ean);
    if (!p) {
      report.aVerifier++;
      report.errors.push(`SumUp manquant pour EAN ${ean} (${official.flavor})`);
      report.products.push({
        ean,
        flavor: official.flavor,
        status: "a_verifier",
        reason: "sumup_absent",
      });
      continue;
    }

    report.integrated++;
    if (p.barcode) report.eanAssociated++;
    if (p.sumupProductId) report.sumupAssociated++;

    const slug = `twenty-${slugify(official.flavor)}-20ml`;
    const name = displayName(official.flavor);
    const imageLocal = await downloadOfficialImage(official.imageUrl, slug);
    if (imageLocal) report.photosAssociated++;

    const canPublish =
      !!imageLocal &&
      !!p.priceCents &&
      p.priceCents > 0 &&
      !!p.sumupProductId &&
      !!p.barcode;

    const fileOk = imageLocal
      ? fs.existsSync(path.resolve("public", imageLocal.replace(/^\//, "")))
      : false;
    const publish = Boolean(canPublish && fileOk);

    // Variante 20 ml (taux 0 mg déclaré sur la fiche officielle)
    const existingVar =
      p.variants.find((v) => v.capacityMl === 20) || p.variants[0] || null;
    if (existingVar) {
      await prisma.productVariant.update({
        where: { id: existingVar.id },
        data: {
          name: "20 ml",
          capacityMl: 20,
          nicotineMg: 0,
          nicotineLabel: "0 mg",
          priceCents: p.priceCents,
          stock: p.stock,
          barcode: p.barcode,
          sumupProductId: p.sumupProductId,
          sumupVariantId: p.sumupVariantId,
          active: true,
        },
      });
    } else {
      await prisma.productVariant.create({
        data: {
          productId: p.id,
          name: "20 ml",
          capacityMl: 20,
          nicotineMg: 0,
          nicotineLabel: "0 mg",
          priceCents: p.priceCents,
          stock: p.stock,
          barcode: p.barcode,
          sumupProductId: p.sumupProductId,
          sumupVariantId: p.sumupVariantId,
          active: true,
        },
      });
    }

    if (imageLocal) {
      const existsImg = p.catalogImages.find((i) => i.url === imageLocal);
      if (!existsImg) {
        await prisma.productImage.create({
          data: {
            productId: p.id,
            url: imageLocal,
            status: "official",
            sortOrder: 0,
            alt: name,
          },
        });
      }
    }

    if (!p.flavors[0]) {
      await prisma.productFlavor.create({
        data: {
          productId: p.id,
          primaryFlavor: official.flavor,
          flavors: [official.flavor],
          searchKeywords: `e.Tasty Twenty ${official.flavor} 20ml 20 ml`,
          isMint: /menthe/i.test(official.flavor) || undefined,
          isFruity: /fruit|peche|cerise|rouge/i.test(official.flavor) || undefined,
          isDrink: /limonade/i.test(official.flavor) || undefined,
        },
      });
    } else {
      await prisma.productFlavor.update({
        where: { id: p.flavors[0].id },
        data: {
          primaryFlavor: official.flavor,
          flavors: [official.flavor],
          searchKeywords: `e.Tasty Twenty ${official.flavor} 20ml 20 ml`,
        },
      });
    }

    // Évite collision de slug si déjà pris par un autre id
    const slugTaken = await prisma.product.findFirst({
      where: { slug, NOT: { id: p.id } },
    });
    const finalSlug = slugTaken ? `${slug}-${p.id.slice(-6)}` : slug;

    await prisma.product.update({
      where: { id: p.id },
      data: {
        name,
        slug: finalSlug,
        shortDescription: `${official.flavor} — gamme Twenty (e.Tasty) — format 20 ml.`,
        category: "E-liquides",
        brand: "e.Tasty",
        brandId: brand.id,
        manufacturerId: manufacturer.id,
        rangeId: range.id,
        range: "Twenty",
        productFamily: "ETASTY_TWENTY",
        productType: "20ml",
        volumeMl: 20,
        promotion10mlEligible: false,
        imageUrl: imageLocal || p.imageUrl,
        imageStatus: imageLocal ? "official" : p.imageStatus,
        catalogStatus: publish ? "valide" : "a_verifier",
        visibleOnline: publish,
        isActive: true,
        importAnomaly: publish
          ? null
          : [
              !imageLocal ? "photo_officielle_manquante" : null,
              !p.priceCents ? "prix_manquant" : null,
              !p.sumupProductId ? "sumup_manquant" : null,
            ]
              .filter(Boolean)
              .join("|") || "a_verifier",
      },
    });

    if (publish) report.published++;
    else report.aVerifier++;

    report.products.push({
      ean,
      name,
      slug: finalSlug,
      priceCents: p.priceCents,
      stock: p.stock,
      sumupProductId: p.sumupProductId,
      imageUrl: imageLocal,
      published: publish,
    });
  }

  // Double filet : aucun Twenty ne doit être promo 10 ml / 10ml
  await prisma.product.updateMany({
    where: { productFamily: "ETASTY_TWENTY" },
    data: {
      promotion10mlEligible: false,
      volumeMl: 20,
      productType: "20ml",
    },
  });

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(
    REPORT_MD,
    [
      `# Rapport Twenty (e.Tasty) — 20 ml`,
      ``,
      `- Date : ${report.date}`,
      `- Détectés (SumUp EAN) : ${report.detected}`,
      `- Intégrés : ${report.integrated}`,
      `- Publiés : ${report.published}`,
      `- À vérifier : ${report.aVerifier}`,
      `- Photos associées : ${report.photosAssociated}`,
      `- EAN associés : ${report.eanAssociated}`,
      `- Réfs SumUp : ${report.sumupAssociated}`,
      ``,
      `## Produits`,
      ...report.products.map(
        (p) =>
          `- ${p.name} — ${p.published ? "PUBLIÉ" : "À VÉRIFIER"} — EAN ${p.ean} — ${p.priceCents} c — stock ${p.stock}`
      ),
      ``,
      `## URLs locales`,
      `- Fabricant : http://localhost:3000/fabricants/e-tasty`,
      `- Gamme : http://localhost:3000/gammes/twenty?fabricant=e-tasty`,
      `- Format : http://localhost:3000/formats/20ml`,
      ``,
      report.errors.length
        ? `## Erreurs\n${report.errors.map((e) => `- ${e}`).join("\n")}`
        : `## Erreurs\nAucune`,
    ].join("\n"),
    "utf8"
  );

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nRapport : ${REPORT_MD}`);
}

main()
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .then(async () => prisma.$disconnect());
