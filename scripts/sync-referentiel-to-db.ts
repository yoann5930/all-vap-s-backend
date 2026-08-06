#!/usr/bin/env tsx
/**
 * Étape 6 — Synchronise le référentiel JSON → PostgreSQL.
 *
 * - Upsert Manufacturer / Brand / ProductRange / CatalogFormat
 * - Relie les produits catalogStatus=valide quand le match référentiel est clair
 * - N'invente rien : format / liens ambigus → laissés tels quels + anomaly
 * - Ne crée AUCUNE page front
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

const REF = path.resolve("data/referentiel");

function load<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(REF, name), "utf8")) as T;
}

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

async function main() {
  console.log("=== Sync référentiel → DB (étape 6) ===\n");

  const fabricants = load<{ items: any[] }>("01_FABRICANTS.json");
  const gammes = load<{ items: any[] }>("02_GAMMES.json");
  const formats = load<{ items: any[] }>("03_FORMATS.json");
  const marques = load<{ items: any[] }>("00_MARQUES.json");
  const produits = load<{ items: any[] }>("06_PRODUITS.json");

  // 1) Formats
  for (const f of formats.items) {
    await prisma.catalogFormat.upsert({
      where: { code: f.code },
      create: {
        code: f.code,
        label: f.label,
        ml: f.ml,
        status: f.status || "valide",
        sortOrder: f.ml || 0,
      },
      update: {
        label: f.label,
        ml: f.ml,
        status: f.status || "valide",
        sortOrder: f.ml || 0,
      },
    });
  }
  console.log(`Formats upsert : ${formats.items.length}`);

  // 2) Fabricants
  const mfrBySlug = new Map<string, string>();
  const mfrByName = new Map<string, string>();
  let i = 0;
  for (const f of fabricants.items) {
    const row = await prisma.manufacturer.upsert({
      where: { slug: f.slug },
      create: {
        masterId: f.id,
        name: f.nom,
        slug: f.slug,
        website: f.site,
        country: f.pays,
        status: f.status,
        sortOrder: i++,
        isActive: f.status !== "a_verifier" || (f.produitsCountMaster || 0) > 0,
      },
      update: {
        masterId: f.id,
        name: f.nom,
        website: f.site,
        country: f.pays,
        status: f.status,
      },
    });
    mfrBySlug.set(f.slug, row.id);
    mfrByName.set(slugify(f.nom), row.id);
    mfrByName.set(f.nom.toLowerCase(), row.id);
  }
  console.log(`Fabricants upsert : ${fabricants.items.length}`);

  // 3) Marques (Brand) — liées au fabricant
  const brandBySlug = new Map<string, string>();
  const brandByName = new Map<string, string>();

  // Assurer une Brand "miroir" par fabricant (navigation fabricant→produits)
  for (const f of fabricants.items) {
    const mfrId = mfrBySlug.get(f.slug)!;
    const row = await prisma.brand.upsert({
      where: { slug: f.slug },
      create: {
        name: f.nom,
        slug: f.slug,
        manufacturerId: mfrId,
        masterId: `BRD-mfr-${f.slug}`,
        status: f.status,
        isActive: true,
      },
      update: {
        name: f.nom,
        manufacturerId: mfrId,
        status: f.status,
      },
    });
    brandBySlug.set(f.slug, row.id);
    brandByName.set(f.nom.toLowerCase(), row.id);
  }

  for (const b of marques.items) {
    const slug = slugify(b.nom_normalise || b.nom);
    const mfrId =
      mfrByName.get(slugify(b.fabricant || "")) ||
      mfrByName.get((b.fabricant || "").toLowerCase()) ||
      null;
    // Ne pas écraser le slug fabricant si collision (ex. Liquidarom marque = fabricant)
    const existing = brandBySlug.get(slug);
    if (existing) {
      brandByName.set((b.nom || "").toLowerCase(), existing);
      continue;
    }
    const row = await prisma.brand.upsert({
      where: { slug },
      create: {
        name: b.nom,
        slug,
        manufacturerId: mfrId,
        masterId: b.id_marque,
        status: "a_verifier",
        isActive: true,
      },
      update: {
        name: b.nom,
        manufacturerId: mfrId,
        masterId: b.id_marque,
      },
    });
    brandBySlug.set(slug, row.id);
    brandByName.set((b.nom || "").toLowerCase(), row.id);
  }
  console.log(`Marques/Brands upsert : ${brandBySlug.size}`);

  // 4) Gammes
  const rangeByMasterId = new Map<string, string>();
  const rangeByFabGamme = new Map<string, string>();

  for (const g of gammes.items) {
    const mfrId =
      mfrBySlug.get(g.fabricantSlug) ||
      mfrByName.get(slugify(g.fabricant || "")) ||
      mfrByName.get((g.fabricant || "").toLowerCase());
    if (!mfrId) {
      console.warn(`  ⚠ gamme sans fabricant DB : ${g.nom} (${g.fabricant})`);
      continue;
    }
    const brandId = brandBySlug.get(g.fabricantSlug) || brandBySlug.get(slugify(g.fabricant || ""));
    if (!brandId) {
      console.warn(`  ⚠ gamme sans brand DB : ${g.nom}`);
      continue;
    }

    let row;
    if (g.id) {
      const existing = await prisma.productRange.findFirst({ where: { masterId: g.id } });
      if (existing) {
        row = await prisma.productRange.update({
          where: { id: existing.id },
          data: {
            name: g.nom,
            slug: g.slug,
            brandId,
            manufacturerId: mfrId,
            formatCodes: g.formatCodes || [],
            status: g.status,
          },
        });
      } else {
        // unique brandId+slug
        const bySlug = await prisma.productRange.findFirst({
          where: { brandId, slug: g.slug },
        });
        if (bySlug) {
          row = await prisma.productRange.update({
            where: { id: bySlug.id },
            data: {
              masterId: g.id,
              manufacturerId: mfrId,
              formatCodes: g.formatCodes || [],
              status: g.status,
              name: g.nom,
            },
          });
        } else {
          row = await prisma.productRange.create({
            data: {
              masterId: g.id,
              brandId,
              manufacturerId: mfrId,
              name: g.nom,
              slug: g.slug,
              formatCodes: g.formatCodes || [],
              status: g.status,
            },
          });
        }
      }
    } else {
      continue;
    }
    rangeByMasterId.set(g.id, row.id);
    rangeByFabGamme.set(`${g.fabricantSlug}::${g.slug}`, row.id);
  }
  console.log(`Gammes upsert : ${rangeByMasterId.size}`);

  // 5) Lier produits validés (match référentiel clair)
  let linked = 0;
  let skipped = 0;
  let formatSet = 0;

  for (const p of produits.items) {
    if (p.catalogStatus !== "valide" || !p.db?.productId) {
      skipped++;
      continue;
    }

    const mfrId =
      mfrBySlug.get(p.fabricantSlug) ||
      mfrByName.get(slugify(p.fabricant || "")) ||
      null;
    const brandId =
      (p.marque && brandByName.get(String(p.marque).toLowerCase())) ||
      brandBySlug.get(p.fabricantSlug) ||
      null;
    const rangeId =
      rangeByFabGamme.get(`${p.fabricantSlug}::${p.gammeSlug}`) ||
      null;

    const data: Record<string, unknown> = {
      brand: p.fabricant || undefined,
      range: p.gamme || undefined,
      reference: p.idMaster,
    };
    if (mfrId) data.manufacturerId = mfrId;
    if (brandId) data.brandId = brandId;
    if (rangeId) data.rangeId = rangeId;

    // Format : uniquement si clair dans le référentiel — sinon ne pas inventer
    if (p.formatStatus === "valide" && p.format) {
      data.productType = p.format;
      formatSet++;
    }

    await prisma.product.update({
      where: { id: p.db.productId },
      data,
    });
    linked++;
  }

  const summary = {
    date: new Date().toISOString(),
    manufacturers: await prisma.manufacturer.count(),
    brands: await prisma.brand.count(),
    ranges: await prisma.productRange.count(),
    formats: await prisma.catalogFormat.count(),
    productsLinked: linked,
    productsSkipped: skipped,
    formatsApplied: formatSet,
    validesSansFormat: await prisma.product.count({
      where: { catalogStatus: "valide", OR: [{ productType: null }, { productType: "" }] },
    }),
    validesSansManufacturer: await prisma.product.count({
      where: { catalogStatus: "valide", manufacturerId: null },
    }),
    frontBloque: true,
  };

  fs.writeFileSync(
    path.join(REF, "08_SYNC_DB.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  // Mettre à jour INDEX statut étape 6
  const indexPath = path.join(REF, "INDEX.md");
  if (fs.existsSync(indexPath)) {
    let md = fs.readFileSync(indexPath, "utf8");
    md = md.replace(
      /\| 6 \| Produits \+ arbre \|.*/,
      `| 6 | Produits + arbre + sync DB | \`06_PRODUITS.json\`, \`07_ARBRE.json\`, \`08_SYNC_DB.json\` | ✅ DB: ${summary.manufacturers} fab / ${summary.ranges} gammes / ${summary.formats} formats / ${summary.productsLinked} produits liés |`
    );
    if (!md.includes("## Sync DB")) {
      md += `\n## Sync DB\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`;
    }
    fs.writeFileSync(indexPath, md, "utf8");
  }

  console.log("\n" + JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
