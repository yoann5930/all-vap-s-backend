/**
 * Push catalogue All Vap's → SumUp (noms + images) — OBLIGATOIRE.
 *
 * SumUp n'expose pas d'API catalogue publique (été 2026 prévu).
 * Canal supporté : CSV Items (même format que l'export SumUp) à réimporter
 * dans le dashboard : Articles → Importer.
 *
 * Colonnes critiques :
 * - Item name
 * - Image 1..7 (URL HTTPS publiques — SumUp les télécharge)
 * - Item id / Variant id (ne pas changer)
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "@/lib/prisma";
import { parseCsv } from "@/lib/import/csv";
import {
  isEliquideProduct,
  hasOfficialProductImage,
  parseNameProvenance,
  namesAreCompatible,
} from "@/lib/catalog/official-sumup-policy";
import { normalizeCatalogKey } from "@/lib/catalog/assert-no-duplicates";

const INBOX_DIR = () =>
  path.resolve(process.cwd(), process.env.SUMUP_INBOX_PATH || "inbox_sumup");
const OUTBOX_DIR = () =>
  path.resolve(process.cwd(), process.env.SUMUP_OUTBOX_PATH || "outbox_sumup");

export type SumUpCatalogPushRow = {
  sumupProductId: string;
  sumupVariantId: string | null;
  productId: string;
  nameBefore: string;
  nameAfter: string;
  imageBefore: string | null;
  imageAfter: string | null;
  nameChanged: boolean;
  imageChanged: boolean;
};

export type SumUpCatalogPushResult = {
  ok: boolean;
  mode: "csv_outbox";
  apiCatalogAvailable: false;
  apiNote: string;
  message: string;
  publicBaseUrl: string;
  imagesPubliclyReachable: boolean;
  sourceCsv: string | null;
  outboxCsv: string | null;
  outboxManifest: string | null;
  scannedCsvRows: number;
  matchedProducts: number;
  nameUpdates: number;
  imageUpdates: number;
  skippedNoMatch: number;
  skippedNoChange: number;
  rows: SumUpCatalogPushRow[];
  importInstructions: string[];
};

function findLatestItemsExportCsv(): string | null {
  const dir = INBOX_DIR();
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /items-export.*\.csv$/i.test(f) || /sumup.*items.*\.csv$/i.test(f))
    .map((f) => {
      const full = path.join(dir, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.full ?? null;
}

function resolvePublicBaseUrl(): { base: string; reachableBySumUp: boolean } {
  const raw = (
    process.env.SUMUP_PUSH_PUBLIC_BASE_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  const base = raw || "http://localhost:3000";
  const reachableBySumUp = /^https:\/\//i.test(base) && !/localhost|127\.0\.0\.1/i.test(base);
  return { base, reachableBySumUp };
}

/** Base URL pour les Image* du CSV SumUp (doit être HTTPS public). */
function resolveImagePushBaseUrl(publicBase: string, reachable: boolean): string {
  if (reachable) return publicBase;
  const forced = (process.env.SUMUP_PUSH_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (forced && /^https:\/\//i.test(forced) && !/localhost|127\.0\.0\.1/i.test(forced)) {
    return forced;
  }
  // Domaine prod par défaut pour préparer le CSV même en local
  return (process.env.SUMUP_PUSH_IMAGE_BASE_URL || "https://www.allvaps.fr").replace(/\/$/, "");
}

function toPublicImageUrl(
  imageUrl: string | null | undefined,
  base: string
): string | null {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  if (!imageUrl.startsWith("/")) return null;
  return `${base}${imageUrl}`;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function detectIdColumns(headers: string[]): {
  itemId: string | null;
  variantId: string | null;
  name: string | null;
  image1: string | null;
} {
  const norm = (h: string) => h.trim().toLowerCase();
  const find = (...aliases: string[]) =>
    headers.find((h) => aliases.includes(norm(h))) || null;
  return {
    itemId: find("item id (do not change)", "item id", "item_id"),
    variantId: find("variant id (do not change)", "variant id", "variant_id"),
    name: find("item name", "name", "nom"),
    image1: find("image 1", "image1", "image"),
  };
}

/**
 * Génère le CSV SumUp prêt à réimporter (noms + images All Vap's → caisse).
 * Ne modifie pas SumUp directement (pas d'API) — écrit `outbox_sumup/`.
 */
export async function pushCatalogToSumUp(params?: {
  /** Si true, ne pousse que les e-liquides (défaut true). */
  eliquidesOnly?: boolean;
  /** Force la génération même sans changement (défaut false). */
  forceAll?: boolean;
}): Promise<SumUpCatalogPushResult> {
  const eliquidesOnly = params?.eliquidesOnly !== false;
  const forceAll = !!params?.forceAll;
  const { base: publicBaseUrl, reachableBySumUp } = resolvePublicBaseUrl();
  const imagePushBase = resolveImagePushBaseUrl(publicBaseUrl, reachableBySumUp);

  const apiNote =
    "SumUp n'expose pas d'API catalogue publique (push via CSV Items obligatoire). " +
    "API catalogue annoncée pour plus tard — ce module basculera automatiquement quand disponible.";

  const sourceCsv = findLatestItemsExportCsv();
  if (!sourceCsv) {
    return {
      ok: false,
      mode: "csv_outbox",
      apiCatalogAvailable: false,
      apiNote,
      message:
        "Aucun CSV SumUp dans inbox_sumup/. Exportez Articles depuis SumUp puis relancez sumup:push-catalog.",
      publicBaseUrl,
      imagesPubliclyReachable: reachableBySumUp,
      sourceCsv: null,
      outboxCsv: null,
      outboxManifest: null,
      scannedCsvRows: 0,
      matchedProducts: 0,
      nameUpdates: 0,
      imageUpdates: 0,
      skippedNoMatch: 0,
      skippedNoChange: 0,
      rows: [],
      importInstructions: [
        "SumUp → Articles → Exporter",
        "Déposer le fichier dans inbox_sumup/",
        "npm run sumup:push-catalog",
      ],
    };
  }

  const rawText = fs.readFileSync(sourceCsv, "utf8");
  const parsed = parseCsv(rawText);
  if (!parsed.length) {
    return {
      ok: false,
      mode: "csv_outbox",
      apiCatalogAvailable: false,
      apiNote,
      message: "CSV SumUp vide ou illisible",
      publicBaseUrl,
      imagesPubliclyReachable: reachableBySumUp,
      sourceCsv,
      outboxCsv: null,
      outboxManifest: null,
      scannedCsvRows: 0,
      matchedProducts: 0,
      nameUpdates: 0,
      imageUpdates: 0,
      skippedNoMatch: 0,
      skippedNoChange: 0,
      rows: [],
      importInstructions: [],
    };
  }

  const headers = Object.keys(parsed[0]);
  const cols = detectIdColumns(headers);
  if (!cols.itemId || !cols.name) {
    return {
      ok: false,
      mode: "csv_outbox",
      apiCatalogAvailable: false,
      apiNote,
      message: "Colonnes Item id / Item name introuvables dans le CSV SumUp",
      publicBaseUrl,
      imagesPubliclyReachable: reachableBySumUp,
      sourceCsv,
      outboxCsv: null,
      outboxManifest: null,
      scannedCsvRows: parsed.length,
      matchedProducts: 0,
      nameUpdates: 0,
      imageUpdates: 0,
      skippedNoMatch: 0,
      skippedNoChange: 0,
      rows: [],
      importInstructions: [],
    };
  }

  const products = await prisma.product.findMany({
    where: {
      sumupProductId: { not: null },
      isActive: true,
      ...(eliquidesOnly
        ? {
            OR: [
              { category: { contains: "liquide", mode: "insensitive" } },
              { category: { equals: "e-liquides" } },
              { productType: { in: ["10ml", "30ml", "50ml", "70ml", "100ml"] } },
              { volumeMl: { in: [10, 30, 50, 70, 100] } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      sumupName: true,
      sumupProductId: true,
      sumupVariantId: true,
      imageUrl: true,
      imageStatus: true,
      category: true,
      productType: true,
      volumeMl: true,
      visibleOnline: true,
      sumupMapping: true,
    },
  });

  const bySumupId = new Map<string, (typeof products)[number]>();
  for (const p of products) {
    if (!p.sumupProductId) continue;
    if (
      eliquidesOnly &&
      !isEliquideProduct({
        category: p.category,
        productType: p.productType,
        volumeMl: p.volumeMl,
      })
    ) {
      continue;
    }
    bySumupId.set(p.sumupProductId, p);
  }

  const pushRows: SumUpCatalogPushRow[] = [];
  let matched = 0;
  let skippedNoMatch = 0;
  let skippedNoChange = 0;
  let nameUpdates = 0;
  let imageUpdates = 0;

  const outRows: Record<string, string>[] = [];

  for (const raw of parsed) {
    const itemId = (raw[cols.itemId] || "").trim();
    const product = itemId ? bySumupId.get(itemId) : undefined;
    const next = { ...raw };

    if (!product) {
      skippedNoMatch += 1;
      outRows.push(next);
      continue;
    }
    matched += 1;

    const csvName = (raw[cols.name] || "").trim();
    const provenance = parseNameProvenance(product.sumupMapping);
    const imageBefore = cols.image1 ? (raw[cols.image1] || "").trim() || null : null;

    // 1) Pull : sumupName = vérité caisse (CSV)
    // 2) Push nom → SumUp seulement si titre officiel prouvé (URL), compatible tokens
    // 3) Sinon name site = nom CSV (pas d'invention / pas d'écrasement SumUp)
    let nameAfter = csvName;
    let nameChanged = false;
    if (provenance.kind === "official") {
      const official = provenance.officialTitle.trim();
      if (
        official &&
        namesAreCompatible(official, csvName) &&
        normalizeCatalogKey(official) !== normalizeCatalogKey(csvName)
      ) {
        nameAfter = official;
        nameChanged = true;
      }
    } else if (
      forceAll &&
      product.visibleOnline &&
      hasOfficialProductImage({
        imageStatus: product.imageStatus,
        imageUrl: product.imageUrl,
      }) &&
      product.name.trim() &&
      namesAreCompatible(product.name, csvName) &&
      normalizeCatalogKey(product.name) !== normalizeCatalogKey(csvName)
    ) {
      // --force : autorise push du nom site si photo officielle + même identité
      nameAfter = product.name.trim();
      nameChanged = true;
    }

    let imageAfter: string | null = imageBefore;
    let imageChanged = false;

    if (
      cols.image1 &&
      hasOfficialProductImage({
        imageStatus: product.imageStatus,
        imageUrl: product.imageUrl,
      })
    ) {
      const publicImg = toPublicImageUrl(product.imageUrl, imagePushBase);
      if (publicImg) {
        imageAfter = publicImg;
        imageChanged = (imageBefore || "") !== publicImg;
      }
    }

    // Aligner la DB sur SumUp (pull) si pas de push nom officiel
    const dbNameTarget = nameChanged ? nameAfter : csvName;
    const needDbAlign =
      normalizeCatalogKey(product.sumupName || "") !== normalizeCatalogKey(csvName) ||
      normalizeCatalogKey(product.name) !== normalizeCatalogKey(dbNameTarget);

    if (!forceAll && !nameChanged && !imageChanged && !needDbAlign) {
      skippedNoChange += 1;
      outRows.push(next);
      continue;
    }

    if (nameChanged) {
      next[cols.name] = nameAfter;
      nameUpdates += 1;
    }
    if (cols.image1 && imageChanged) {
      next[cols.image1] = imageAfter || "";
      imageUpdates += 1;
    }

    if (nameChanged || imageChanged) {
      pushRows.push({
        sumupProductId: itemId,
        sumupVariantId: cols.variantId
          ? raw[cols.variantId] || null
          : product.sumupVariantId,
        productId: product.id,
        nameBefore: csvName,
        nameAfter,
        imageBefore,
        imageAfter,
        nameChanged,
        imageChanged,
      });
    }

    outRows.push(next);

    const mappingPayload = {
      catalogPush: {
        status: nameChanged || imageChanged ? "outbox_ready" : "pulled_from_sumup",
        preparedAt: new Date().toISOString(),
        nameAfter: dbNameTarget,
        imageAfter,
        publicBaseUrl,
        imagesPubliclyReachable: reachableBySumUp,
        nameProvenance: provenance.kind,
      },
      ...(provenance.kind === "official"
        ? {
            nameSource: "official",
            nameSourceUrl: provenance.sourceUrl,
            officialTitle: provenance.officialTitle,
          }
        : {}),
    };

    await prisma.product.update({
      where: { id: product.id },
      data: {
        name: dbNameTarget,
        sumupName: csvName,
        sumupMapping: JSON.stringify(mappingPayload),
        sumupLastSync: new Date(),
      },
    });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  fs.mkdirSync(OUTBOX_DIR(), { recursive: true });
  const outboxCsv = path.join(OUTBOX_DIR(), `${stamp}_items-push_ALLVAPS.csv`);
  const outboxManifest = path.join(OUTBOX_DIR(), `${stamp}_items-push_manifest.json`);

  const headerLine = headers.join(",");
  const body = outRows
    .map((row) => headers.map((h) => csvEscape(row[h] ?? "")).join(","))
    .join("\n");
  fs.writeFileSync(outboxCsv, `${headerLine}\n${body}\n`, "utf8");

  const importInstructions = [
    "1. Ouvrir SumUp → Articles (Item catalogue)",
    "2. Importer le CSV généré dans outbox_sumup/ (même format que l'export)",
    "3. Vérifier noms + images sur quelques e-liquides en caisse",
    "4. Ré-exporter Articles → déposer dans inbox_sumup/",
    "5. npm run sumup:connect-stock (confirme le pull)",
    ...(reachableBySumUp
      ? []
      : [
          `⚠ Images préparées avec base ${imagePushBase} — le site doit servir ces URLs en HTTPS pour que SumUp les télécharge à l'import.`,
        ]),
  ];

  const manifest = {
    date: new Date().toISOString(),
    sourceCsv,
    outboxCsv,
    publicBaseUrl,
    imagePushBase,
    imagesPubliclyReachable: reachableBySumUp,
    matched,
    nameUpdates,
    imageUpdates,
    pushRows,
    importInstructions,
    apiNote,
  };
  fs.writeFileSync(outboxManifest, JSON.stringify(manifest, null, 2), "utf8");

  // Copie « latest » pour l'opérateur
  fs.copyFileSync(outboxCsv, path.join(OUTBOX_DIR(), "LATEST_items-push_ALLVAPS.csv"));
  fs.writeFileSync(
    path.join(OUTBOX_DIR(), "LATEST_items-push_manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(OUTBOX_DIR(), "README.md"),
    `# Outbox SumUp — push noms + images (obligation)

SumUp **n'a pas d'API catalogue**. La sync All Vap's → SumUp passe par ce CSV.

## Procédure obligatoire

${importInstructions.map((l) => `- ${l}`).join("\n")}

## Fichiers

- \`LATEST_items-push_ALLVAPS.csv\` — à importer dans SumUp
- \`LATEST_items-push_manifest.json\` — détail des lignes modifiées

## Variables

- \`SUMUP_PUSH_PUBLIC_BASE_URL\` — URL HTTPS publique du site (images)
- \`SUMUP_OUTBOX_PATH\` — dossier outbox (défaut \`outbox_sumup\`)
`,
    "utf8"
  );

  const changed = nameUpdates + imageUpdates;
  const alignedNote =
    changed > 0
      ? `Push préparé : ${nameUpdates} noms + ${imageUpdates} images → importer ${path.basename(outboxCsv)} dans SumUp` +
        (reachableBySumUp ? "" : ` (images via ${imagePushBase})`)
      : `Sync catalogue OK (pull noms SumUp→site). Aucun push nom/image en attente`;

  return {
    ok: true,
    mode: "csv_outbox",
    apiCatalogAvailable: false,
    apiNote,
    message: alignedNote,
    publicBaseUrl: imagePushBase,
    imagesPubliclyReachable: reachableBySumUp,
    sourceCsv,
    outboxCsv,
    outboxManifest,
    scannedCsvRows: parsed.length,
    matchedProducts: matched,
    nameUpdates,
    imageUpdates,
    skippedNoMatch,
    skippedNoChange,
    rows: pushRows,
    importInstructions,
  };
}
