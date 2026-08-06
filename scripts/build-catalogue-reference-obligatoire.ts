/**
 * Génère data/catalog/yoann/catalogue-reference-obligatoire.json
 * depuis allvaps_catalogue.json + remaps collections (Blackout ⊂ Call of Vape).
 *
 * Usage: npx tsx scripts/build-catalogue-reference-obligatoire.ts
 */
import fs from "node:fs";
import path from "node:path";

type YoannProduct = { name: string; format_ml?: number };
type YoannRange = { name: string; aliases?: string[]; products?: YoannProduct[] };
type YoannMfr = { id: string; name: string; aliases?: string[]; ranges?: YoannRange[] };

/** Yoann a listé des « gammes » qui sont en réalité des collections. */
const COLLECTION_REMAPS: Array<{
  manufacturerSlug: string;
  falseRangeName: string;
  parentRangeName: string;
  collectionName: string;
  collectionSlug: string;
}> = [
  {
    manufacturerSlug: "cloud-vapor",
    falseRangeName: "Call Of Vape Blackout",
    parentRangeName: "Call Of Vape",
    collectionName: "Blackout",
    collectionSlug: "blackout",
  },
  {
    manufacturerSlug: "cloud-vapor",
    falseRangeName: "Call of Vape Blackout",
    parentRangeName: "Call Of Vape",
    collectionName: "Blackout",
    collectionSlug: "blackout",
  },
];

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function main() {
  const yoannPath = path.resolve("data/catalog/yoann/allvaps_catalogue.json");
  const yoann = JSON.parse(fs.readFileSync(yoannPath, "utf8")) as {
    manufacturers: YoannMfr[];
  };

  const manufacturers = [];

  for (const jm of yoann.manufacturers) {
    const slug = jm.id === "etasty" ? "e-tasty" : jm.id;
    const rangeMap = new Map<
      string,
      {
        name: string;
        slug: string;
        collections: Array<{
          name: string;
          slug: string;
          products: Array<{ name: string; formatMl?: number }>;
        }>;
        products: Array<{ name: string; formatMl?: number; collectionSlug?: string }>;
      }
    >();

    for (const jr of jm.ranges || []) {
      const remap = COLLECTION_REMAPS.find(
        (r) =>
          r.manufacturerSlug === slug &&
          norm(r.falseRangeName) === norm(jr.name)
      );

      if (remap) {
        const parentKey = norm(remap.parentRangeName);
        let parent = rangeMap.get(parentKey);
        if (!parent) {
          parent = {
            name: remap.parentRangeName,
            slug: slugify(remap.parentRangeName),
            collections: [],
            products: [],
          };
          rangeMap.set(parentKey, parent);
        }
        if (!parent.collections.some((c) => c.slug === remap.collectionSlug)) {
          parent.collections.push({
            name: remap.collectionName,
            slug: remap.collectionSlug,
            products: (jr.products || []).map((p) => ({
              name: p.name,
              formatMl: p.format_ml,
            })),
          });
        }
        continue;
      }

      const key = norm(jr.name);
      let range = rangeMap.get(key);
      if (!range) {
        range = {
          name: jr.name,
          slug: slugify(jr.name),
          collections: [],
          products: [],
        };
        rangeMap.set(key, range);
      }
      for (const p of jr.products || []) {
        range.products.push({ name: p.name, formatMl: p.format_ml });
      }
    }

    manufacturers.push({
      name: jm.name,
      slug,
      aliases: jm.aliases || [],
      ranges: [...rangeMap.values()],
    });
  }

  const out = {
    schemaVersion: "1.0.0",
    project: "All Vap's",
    purpose: "Référence obligatoire — hiérarchie Fabricant → Gamme → Collection → Produit",
    generatedAt: new Date().toISOString(),
    source: "data/catalog/yoann/allvaps_catalogue.json",
    rules: [
      "Ne jamais aplatir Fabricant → Gamme → Collection → Produit",
      "Ne jamais transformer une collection en gamme indépendante",
      "Ne jamais transformer un produit en gamme",
      "Call of Vape Blackout = collection Blackout sous Call of Vape (Cloud Vapor)",
    ],
    manufacturers,
  };

  const outPath = path.resolve("data/catalog/yoann/catalogue-reference-obligatoire.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

  const cloud = manufacturers.find((m) => m.slug === "cloud-vapor");
  console.log("Écrit", outPath);
  console.log(
    "Cloud Vapor ranges:",
    cloud?.ranges.map((r) => ({
      name: r.name,
      collections: r.collections.map((c) => c.name),
      products: r.products.length,
    }))
  );
  console.log("Manufacturers:", manufacturers.length);
  console.log(
    "Ranges:",
    manufacturers.reduce((n, m) => n + m.ranges.length, 0)
  );
}

main();
