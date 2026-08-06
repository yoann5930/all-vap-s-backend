/**
 * Corrige rattachement Vape 47 : ENFER vs Les Fruits d'ENFER + republish gate.
 * Usage: npx tsx scripts/fix-vape47-ranges-and-visibility.ts
 */
import prisma from "../lib/prisma";
import { evaluateEliquidePublishGate } from "../lib/catalog/official-sumup-policy";

function isFruitsDEnfer(name: string): boolean {
  const n = name.toLowerCase();
  return (
    /fruits?\s+d['']?\s*enfer/i.test(n) ||
    /\b(la|le)\s+\w+(\s+\w+)?\s+d\s*['']?\s*enfer\b/i.test(n)
  );
}

function isClassicEnfer(name: string): boolean {
  const n = name.trim();
  if (isFruitsDEnfer(n)) return false;
  return (
    /^enfer(\s|-)/i.test(n) ||
    /\b50\s*ml\s*-\s*enfer\b/i.test(n) ||
    /dragon\s*50\s*ml\s*-\s*enfer/i.test(n) ||
    /\benfer\s+(original|ultimate|red|yellow|mango|pink|blue|green|purple|dragon)\b/i.test(n) ||
    /enfer\s*-\s*enfer/i.test(n)
  );
}

async function main() {
  const mfr = await prisma.manufacturer.findFirst({ where: { slug: "vape-47" } });
  if (!mfr) throw new Error("Vape 47 introuvable");

  let enfer = await prisma.productRange.findFirst({
    where: { manufacturerId: mfr.id, slug: "enfer" },
  });
  let fruits = await prisma.productRange.findFirst({
    where: { manufacturerId: mfr.id, slug: "les-fruits-d-enfer" },
  });
  const furiosa = await prisma.productRange.findFirst({
    where: { manufacturerId: mfr.id, slug: "furiosa-eggz" },
  });

  if (!enfer || !fruits) throw new Error("Gammes enfer / les-fruits-d-enfer manquantes");

  // Noms officiels
  enfer = await prisma.productRange.update({
    where: { id: enfer.id },
    data: {
      name: "ENFER",
      catalogVisible: true,
      verificationStatus: "OFFICIAL_CONFIRMED",
      status: "verifie",
      officialManufacturerUrl: "https://www.vape47.com/",
      officialSourceUrl: "https://www.vape47.com/",
    },
  });
  fruits = await prisma.productRange.update({
    where: { id: fruits.id },
    data: {
      name: "Les Fruits d'ENFER",
      catalogVisible: true,
      verificationStatus: "OFFICIAL_CONFIRMED",
      status: "verifie",
      officialManufacturerUrl: "https://www.vape47.com/",
      officialSourceUrl: "https://www.vape47.com/",
    },
  });

  const products = await prisma.product.findMany({
    where: {
      manufacturerId: mfr.id,
      isActive: true,
      OR: [
        { rangeId: enfer.id },
        { rangeId: fruits.id },
        { rangeId: furiosa?.id },
        { name: { contains: "enfer", mode: "insensitive" } },
        { name: { contains: "Furiosa Eggz", mode: "insensitive" } },
      ],
    },
  });

  let movedEnfer = 0;
  let movedFruits = 0;
  let published = 0;
  let blocked = 0;

  for (const p of products) {
    let targetRangeId = p.rangeId;
    if (isFruitsDEnfer(p.name)) {
      targetRangeId = fruits.id;
      if (p.rangeId !== fruits.id) movedFruits++;
    } else if (isClassicEnfer(p.name)) {
      targetRangeId = enfer.id;
      if (p.rangeId !== enfer.id) movedEnfer++;
    } else if (/furiosa\s*eggz/i.test(p.name) && furiosa) {
      targetRangeId = furiosa.id;
    }

    const gate = evaluateEliquidePublishGate({
      name: p.name,
      productType: p.productType,
      category: p.category,
      volumeMl: p.volumeMl,
      sumupProductId: p.sumupProductId,
      sumupName: p.sumupName,
      priceCents: p.priceCents,
      imageUrl: p.imageUrl,
      imageStatus: p.imageStatus,
      sumupMapping: p.sumupMapping,
    });

    const data: Record<string, unknown> = {
      rangeId: targetRangeId,
      manufacturerId: mfr.id,
    };

    if (gate.canPublishOnline) {
      data.visibleOnline = true;
      data.catalogStatus = "valide";
      published++;
    } else {
      // Ne pas forcer visibleOnline=true si gate KO
      data.visibleOnline = false;
      data.catalogStatus = "a_verifier";
      blocked++;
      console.log(`  BLOCK ${p.name} → ${gate.reasons.join(", ")}`);
    }

    await prisma.product.update({ where: { id: p.id }, data });
  }

  const counts = {
    enfer: await prisma.product.count({ where: { rangeId: enfer.id, isActive: true } }),
    fruits: await prisma.product.count({ where: { rangeId: fruits.id, isActive: true } }),
    furiosa: furiosa
      ? await prisma.product.count({ where: { rangeId: furiosa.id, isActive: true } })
      : 0,
    enferVis: await prisma.product.count({
      where: { rangeId: enfer.id, isActive: true, visibleOnline: true },
    }),
    fruitsVis: await prisma.product.count({
      where: { rangeId: fruits.id, isActive: true, visibleOnline: true },
    }),
    furiosaVis: furiosa
      ? await prisma.product.count({
          where: { rangeId: furiosa.id, isActive: true, visibleOnline: true },
        })
      : 0,
  };

  console.log({
    movedEnfer,
    movedFruits,
    published,
    blocked,
    counts,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
