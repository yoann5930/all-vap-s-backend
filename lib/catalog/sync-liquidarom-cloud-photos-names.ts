/**
 * Sync photos + noms hiérarchie Fabricant — Gamme — Produit.
 * Ne touche JAMAIS au stock.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";

export type SyncRangeCfg = {
  manufacturerSlug: string;
  manufacturerName: string;
  rangeName: string;
  rangeSlug: string;
  mediaDir: string;
};

export const LIQUIDAROM_CLOUD_PHOTO_RANGES: SyncRangeCfg[] = [
  {
    manufacturerSlug: "liquidarom",
    manufacturerName: "Liquidarom",
    rangeName: "Ice Cool",
    rangeSlug: "ice-cool",
    mediaDir: "public/media/products/liquidarom/ice-cool",
  },
  {
    manufacturerSlug: "liquidarom",
    manufacturerName: "Liquidarom",
    rangeName: "Ice Cool X",
    rangeSlug: "ice-cool-x",
    mediaDir: "public/media/products/liquidarom/ice-cool-x",
  },
  {
    manufacturerSlug: "liquidarom",
    manufacturerName: "Liquidarom",
    rangeName: "Les Collègues",
    rangeSlug: "les-collegues",
    mediaDir: "public/media/products/liquidarom/les-collegues",
  },
  {
    manufacturerSlug: "liquidarom",
    manufacturerName: "Liquidarom",
    rangeName: "Les Essentiels",
    rangeSlug: "les-essentiels",
    mediaDir: "public/media/products/liquidarom/les-essentiels",
  },
  {
    manufacturerSlug: "liquidarom",
    manufacturerName: "Liquidarom",
    rangeName: "Replay",
    rangeSlug: "replay",
    mediaDir: "public/media/products/liquidarom/replay",
  },
  {
    manufacturerSlug: "cloud-vapor",
    manufacturerName: "Cloud Vapor",
    rangeName: "Hellfest",
    rangeSlug: "hellfest",
    mediaDir: "public/media/products/cloud-vapor/hellfest",
  },
  {
    manufacturerSlug: "cloud-vapor",
    manufacturerName: "Cloud Vapor",
    rangeName: "Kung Freeze",
    rangeSlug: "kung-freeze",
    mediaDir: "public/media/products/cloud-vapor/kung-freeze",
  },
  {
    manufacturerSlug: "cloud-vapor",
    manufacturerName: "Cloud Vapor",
    rangeName: "Call of Vape",
    rangeSlug: "call-of-vape",
    mediaDir: "public/media/products/cloud-vapor/call-of-vape",
  },
];

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCaseFlavor(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function flavorFromProductName(name: string, rangeName: string, mfr: string) {
  let s = name;
  s = s.replace(new RegExp(mfr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  s = s.replace(new RegExp(rangeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  s = s.replace(/ice\s*cool\s*x?/gi, " ");
  s = s.replace(/\b\d+\s*ml\b/gi, " ");
  s = s.replace(/\b\d+\s*mg\b/gi, " ");
  s = s.replace(/e-?liquide/gi, " ");
  s = s.replace(/[—–>-]+/g, " ");
  return norm(s);
}

function listFlavorWebps(mediaDir: string, root = process.cwd()) {
  const absRoot = path.join(root, mediaDir);
  if (!fs.existsSync(absRoot)) return [] as Array<{ flavor: string; publicUrl: string }>;
  const out: Array<{ flavor: string; publicUrl: string }> = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (/_backup/i.test(ent.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.webp$/i.test(ent.name)) continue;
      if (/-thumb\.webp$/i.test(ent.name)) continue;
      const flavor = norm(ent.name.replace(/\.webp$/i, ""));
      const rel = "/" + path.relative(path.join(root, "public"), full).replace(/\\/g, "/");
      out.push({ flavor, publicUrl: rel });
    }
  };
  walk(absRoot);
  return out;
}

function scoreMatch(fileFlavor: string, productFlavor: string) {
  if (!fileFlavor || !productFlavor) return 0;
  if (fileFlavor === productFlavor) return 1;
  if (productFlavor.includes(fileFlavor) || fileFlavor.includes(productFlavor)) return 0.92;
  const a = fileFlavor.split("-").filter(Boolean);
  const b = productFlavor.split("-").filter(Boolean);
  if (!a.length || !b.length) return 0;
  const inter = a.filter((t) => b.includes(t)).length;
  return inter / Math.max(a.length, b.length);
}

export type SyncPhotosNamesResult = {
  mode: "apply" | "dry-run";
  photosOnly: boolean;
  untouched: { stock: true; names?: true };
  totals: { updated: number; renameOnly: number; unmatchedFiles: number };
  ranges: Array<Record<string, unknown>>;
};

export async function syncLiquidaromCloudPhotosNames(options: {
  apply: boolean;
  /** Si true : met à jour imageUrl uniquement (pas de rename / brand / range). */
  photosOnly?: boolean;
  ranges?: SyncRangeCfg[];
}): Promise<SyncPhotosNamesResult> {
  const APPLY = options.apply;
  const photosOnly = options.photosOnly === true;
  const ranges = options.ranges ?? LIQUIDAROM_CLOUD_PHOTO_RANGES;
  const report: SyncPhotosNamesResult = {
    mode: APPLY ? "apply" : "dry-run",
    photosOnly,
    untouched: { stock: true, ...(photosOnly ? { names: true as const } : {}) },
    totals: { updated: 0, renameOnly: 0, unmatchedFiles: 0 },
    ranges: [],
  };

  for (const cfg of ranges) {
    const files = listFlavorWebps(cfg.mediaDir);
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { manufacturer: { slug: cfg.manufacturerSlug }, range: cfg.rangeName },
          { manufacturer: { slug: cfg.manufacturerSlug }, rangeRef: { slug: cfg.rangeSlug } },
          {
            AND: [
              {
                OR: [
                  { brand: { equals: cfg.manufacturerName, mode: "insensitive" } },
                  { manufacturer: { slug: cfg.manufacturerSlug } },
                ],
              },
              {
                OR: [
                  { range: { equals: cfg.rangeName, mode: "insensitive" } },
                  { name: { contains: cfg.rangeName, mode: "insensitive" } },
                ],
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        brand: true,
        range: true,
        stock: true,
        imageUrl: true,
        productType: true,
        volumeMl: true,
      },
    });

    const rangeRow = await prisma.productRange.findFirst({
      where: { slug: cfg.rangeSlug, manufacturer: { slug: cfg.manufacturerSlug } },
      select: { id: true, name: true, catalogVisible: true, isActive: true },
    });

    const rangeReport: Record<string, unknown> = {
      manufacturer: cfg.manufacturerName,
      range: cfg.rangeName,
      mediaFiles: files.length,
      productsFound: products.length,
      updates: [] as unknown[],
      unmatchedFiles: [] as string[],
    };

    if (
      !photosOnly &&
      rangeRow &&
      APPLY &&
      (!rangeRow.catalogVisible || !rangeRow.isActive)
    ) {
      await prisma.productRange.update({
        where: { id: rangeRow.id },
        data: { catalogVisible: true, isActive: true },
      });
      rangeReport.rangeVisibleForced = true;
    }

    const used = new Set<string>();
    /** photosOnly → règle certaine ≥ 0.7 ; sinon historique ≥ 0.55 */
    const minScore = photosOnly ? 0.7 : 0.55;

    for (const file of files) {
      let best: (typeof products)[0] | null = null;
      let bestScore = 0;
      let secondScore = 0;
      for (const p of products) {
        if (used.has(p.id)) continue;
        const pf = flavorFromProductName(p.name, cfg.rangeName, cfg.manufacturerName);
        const sc = scoreMatch(file.flavor, pf);
        if (sc > bestScore) {
          secondScore = bestScore;
          bestScore = sc;
          best = p;
        } else if (sc > secondScore) {
          secondScore = sc;
        }
      }
      const certain =
        !!best &&
        bestScore >= minScore &&
        (secondScore < minScore || bestScore - secondScore >= 0.05);
      if (!best || !certain) {
        (rangeReport.unmatchedFiles as string[]).push(file.flavor);
        report.totals.unmatchedFiles++;
        continue;
      }
      used.add(best.id);
      const formatMl =
        best.volumeMl === 100 || /100/i.test(best.productType || "") || /100ml/i.test(file.publicUrl)
          ? "100 ml"
          : "50 ml";
      const newName = photosOnly
        ? best.name
        : `${cfg.manufacturerName} — ${cfg.rangeName} — ${titleCaseFlavor(file.flavor)} ${formatMl}`;
      (rangeReport.updates as unknown[]).push({
        id: best.id,
        stock: best.stock,
        from: best.name,
        to: newName,
        imageUrl: file.publicUrl,
        score: bestScore,
        photosOnly,
      });
      if (APPLY) {
        await prisma.product.update({
          where: { id: best.id },
          data: photosOnly
            ? {
                imageUrl: file.publicUrl,
                imageStatus: "validated",
              }
            : {
                name: newName,
                brand: cfg.manufacturerName,
                range: cfg.rangeName,
                imageUrl: file.publicUrl,
                imageStatus: "validated",
                isNew: false,
                ...(rangeRow ? { rangeId: rangeRow.id } : {}),
              },
        });
        await prisma.productImage.deleteMany({ where: { productId: best.id } });
        await prisma.productImage.create({
          data: {
            productId: best.id,
            url: file.publicUrl,
            status: "validated",
            sortOrder: 0,
            alt: newName,
          },
        });
      }
      report.totals.updated++;
    }

    if (!photosOnly) {
      for (const p of products) {
        if (used.has(p.id)) continue;
        const pf = flavorFromProductName(p.name, cfg.rangeName, cfg.manufacturerName);
        if (!pf) continue;
        const formatMl = p.volumeMl === 100 || /100/i.test(p.productType || "") ? "100 ml" : "50 ml";
        const newName = `${cfg.manufacturerName} — ${cfg.rangeName} — ${titleCaseFlavor(pf)} ${formatMl}`;
        if (newName === p.name && p.brand === cfg.manufacturerName) continue;
        (rangeReport.updates as unknown[]).push({
          id: p.id,
          stock: p.stock,
          from: p.name,
          to: newName,
          renameOnly: true,
        });
        if (APPLY) {
          await prisma.product.update({
            where: { id: p.id },
            data: {
              name: newName,
              brand: cfg.manufacturerName,
              range: cfg.rangeName,
              isNew: false,
              ...(rangeRow ? { rangeId: rangeRow.id } : {}),
            },
          });
        }
        report.totals.renameOnly++;
      }
    }

    report.ranges.push(rangeReport);
  }

  return report;
}
