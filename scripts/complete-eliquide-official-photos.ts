/**
 * Mission : compléter l'import e-liquides — file photo + association auto + publish.
 *
 * Pour chaque produit avec SumUp mais sans photo officielle :
 * 1. Cherche un packshot local dans public/media/products/{fabricant}/
 * 2. Sinon tente une recherche site officiel (sources connues)
 * 3. Valide matching nom/saveur (pas de mélange)
 * 4. Associe imageStatus=official
 * 5. Publie si gate OK
 *
 * Usage:
 *   npx tsx scripts/complete-eliquide-official-photos.ts
 *   npx tsx scripts/complete-eliquide-official-photos.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import "./load-env";
import prisma from "../lib/prisma";
import {
  evaluateEliquidePublishGate,
  isEliquideProduct,
  namesAreCompatible,
  parseNameProvenance,
} from "../lib/catalog/official-sumup-policy";
import { normalizeCatalogKey } from "../lib/catalog/assert-no-duplicates";

const APPLY = process.argv.includes("--apply");
const MEDIA_ROOT = path.join(process.cwd(), "public", "media", "products");
const REPORT_JSON = path.resolve("data/rebuild/RAPPORT_COMPLETE_PHOTOS_ELIQUIDES.json");
const REPORT_MD = path.resolve("docs/RAPPORT_COMPLETE_IMPORT_ELIQUIDES.md");
const QUEUE_JSON = path.resolve("data/rebuild/QUEUE_PHOTOS_ELIQUIDES.json");
const UA = "AllVapsCatalogBot/1.0 (+official-packshots)";

type QueueItem = {
  id: string;
  slug: string;
  name: string;
  sumupName: string | null;
  sumupProductId: string | null;
  manufacturerSlug: string | null;
  rangeSlug: string | null;
  reasons: string[];
  blockReason: string;
};

function norm(s: string): string {
  return normalizeCatalogKey(s);
}

function flavorTokens(name: string): string[] {
  return norm(name)
    .split(/\s+/)
    .filter(
      (t) =>
        t.length > 2 &&
        !/^(ml|mg|eliquide|liquide|pack|shortfill|booster|sels?|nicotine|etasty|e|tasty|vape|lab|soft)$/.test(
          t,
        ) &&
        !/^\d+$/.test(t),
    );
}

function scoreFileToProduct(
  fileBase: string,
  productName: string,
  productSlug: string,
  sumupName: string | null,
): number {
  const rawBase = fileBase.replace(/\.(webp|jpe?g|png)$/i, "");
  if (/-thumb$/i.test(rawBase)) return 0; // jamais les thumbs
  const fn = norm(rawBase.replace(/[-_]+/g, " "));
  const slugNorm = norm(productSlug.replace(/[-_]+/g, " "));
  const tokens = flavorTokens(productName);
  if (!tokens.length) return 0;

  // Match fort : slug produit contenu dans le fichier
  const slugCompact = productSlug.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const fileCompact = rawBase.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (slugCompact.length >= 8 && fileCompact.includes(slugCompact)) {
    return 20;
  }

  // Numbers / One Taste : exiger l'identifiant exact
  const num = productName.match(/\bnumbers?\s*(\d+)\b/i) || productSlug.match(/numbers(\d+)/i);
  if (num) {
    const n = num[1];
    if (
      !new RegExp(`numbers?\\s*0*${n}\\b`, "i").test(rawBase) &&
      !new RegExp(`numbers0*${n}(?:[^0-9]|$)`, "i").test(fileCompact)
    ) {
      return 0;
    }
  }

  // Collègues / personnages : le surnom doit être dans le fichier
  const colleague = productName.match(
    /\b(la\s+coquette|la\s+mimi|le\s+bal[eè]ze|le\s+charmeur|le\s+chocostar|le\s+flambeur|le\s+funkie|le\s+tchatcheur)\b/i,
  );
  if (colleague) {
    const key = norm(colleague[1]).replace(/\s+/g, "");
    if (!fn.replace(/\s+/g, "").includes(key) && !fileCompact.includes(key)) {
      return 0;
    }
  }

  // Enfer couleurs / Eggz noms : token distinctif obligatoire
  const distinctive = productName.match(
    /\b(blue|green|mango|original|purple|red|yellow|ultimate|aria|doom|griffon|ivy|juno|nova|volta|kaiser|baron|hyper|dragon|ultra|fraise)\b/i,
  );
  if (distinctive) {
    const d = norm(distinctive[1]);
    if (!fn.includes(d) && !fileCompact.includes(d)) return 0;
  }

  let hits = 0;
  for (const t of tokens) if (fn.includes(t) || fileCompact.includes(t)) hits += 1;
  const ratio = hits / tokens.length;
  if (ratio < 0.85) return 0;

  let score = ratio * 10;
  if (slugNorm && fn.includes(slugNorm.slice(0, Math.min(24, slugNorm.length)))) score += 5;
  if (sumupName && namesAreCompatible(rawBase, sumupName)) score += 2;
  return score;
}

function listMediaFiles(manufacturerSlug: string): string[] {
  const aliases = [manufacturerSlug];
  if (manufacturerSlug === "vape-47") aliases.push("vape47");
  if (manufacturerSlug === "e-tasty") aliases.push("etasty", "e-tasty");
  const files: string[] = [];
  for (const a of aliases) {
    const root = path.join(MEDIA_ROOT, a);
    if (!fs.existsSync(root)) continue;
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name.startsWith("_")) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (/\.(webp|jpe?g|png)$/i.test(ent.name)) files.push(full);
      }
    };
    walk(root);
  }
  return files;
}

function toPublicUrl(abs: string): string {
  const rel = abs.replace(/\\/g, "/").split("/public/")[1];
  return rel ? `/${rel}` : abs;
}

type OfficialSource = {
  base: string;
  search?: (query: string) => string;
  extractImages: (html: string, base: string) => Array<{ url: string; label: string }>;
};

const SOURCES: Record<string, OfficialSource> = {
  "vape-47": {
    base: "https://order.vape47.com",
    search: (q) =>
      `https://order.vape47.com/recherche?controller=search&s=${encodeURIComponent(q)}`,
    extractImages: (html) => {
      const out: Array<{ url: string; label: string }> = [];
      const cleaned = html.replace(/\\\//g, "/");
      for (const m of cleaned.matchAll(
        /https?:\/\/order\.vape47\.com\/(\d+)-(?:home_default_2x|large_default|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
      )) {
        out.push({
          url: `https://order.vape47.com/${m[1]}-home_default_2x/${m[2]}.${m[3]}`,
          label: m[2],
        });
      }
      return out;
    },
  },
  "raneki-liquide": {
    base: "https://www.ranekiliquide.fr",
    search: (q) =>
      `https://www.ranekiliquide.fr/recherche?controller=search&s=${encodeURIComponent(q)}`,
    extractImages: (html, base) => {
      const out: Array<{ url: string; label: string }> = [];
      const cleaned = html.replace(/\\\//g, "/");
      for (const m of cleaned.matchAll(
        /(?:https?:\/\/[^"'\s]+)?\/(\d+)-(?:home_default_2x|large_default|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
      )) {
        const url = m[0].startsWith("http")
          ? m[0].replace(/home_default(?!_2x)/, "home_default_2x")
          : `${base}/${m[1]}-home_default_2x/${m[2]}.${m[3]}`;
        out.push({ url, label: m[2] });
      }
      return out;
    },
  },
  liquidarom: {
    base: "https://www.liquidarom.com",
    search: (q) =>
      `https://www.liquidarom.com/recherche?controller=search&s=${encodeURIComponent(q)}`,
    extractImages: (html, base) => {
      const out: Array<{ url: string; label: string }> = [];
      const cleaned = html.replace(/\\\//g, "/");
      for (const m of cleaned.matchAll(
        /(?:https?:\/\/[^"'\s]+)?\/(\d+)-(?:home_default_2x|large_default|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
      )) {
        const url = m[0].startsWith("http")
          ? m[0].replace(/home_default(?!_2x)/, "home_default_2x")
          : `${base}/${m[1]}-home_default_2x/${m[2]}.${m[3]}`;
        out.push({ url, label: m[2] });
      }
      return out;
    },
  },
  "e-tasty": {
    base: "https://www.e-tasty.fr",
    search: (q) =>
      `https://www.e-tasty.fr/recherche?controller=search&s=${encodeURIComponent(q)}`,
    extractImages: (html, base) => {
      const out: Array<{ url: string; label: string }> = [];
      const cleaned = html.replace(/\\\//g, "/");
      for (const m of cleaned.matchAll(
        /(?:https?:\/\/[^"'\s]+)?\/(\d+)-(?:home_default_2x|large_default|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
      )) {
        const url = m[0].startsWith("http")
          ? m[0].replace(/home_default(?!_2x)/, "home_default_2x")
          : `${base}/${m[1]}-home_default_2x/${m[2]}.${m[3]}`;
        out.push({ url, label: m[2] });
      }
      return out;
    },
  },
  "liquide-lab": {
    base: "https://www.liquidelab.com",
    search: (q) =>
      `https://www.liquidelab.com/recherche?controller=search&s=${encodeURIComponent(q)}`,
    extractImages: (html, base) => {
      const out: Array<{ url: string; label: string }> = [];
      for (const m of html.matchAll(
        /(?:src|data-image-large-src)="([^"]+(?:large_default|home_default)[^"]*\.(?:jpe?g|png|webp))"/gi,
      )) {
        let u = m[1];
        if (u.startsWith("//")) u = `https:${u}`;
        else if (u.startsWith("/")) u = `${base}${u}`;
        out.push({
          url: u,
          label: path.basename(u).replace(/\.(jpe?g|png|webp)$/i, ""),
        });
      }
      return out;
    },
  },
};

async function downloadOfficialWebp(
  url: string,
  destAbs: string,
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1200) return false;
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });
    // Fond sombre + packshot centré (ne fabrique pas de fruits)
    await sharp(buf)
      .rotate()
      .resize(1000, 1000, { fit: "inside", background: { r: 11, g: 16, b: 22, alpha: 1 } })
      .flatten({ background: { r: 11, g: 16, b: 22 } })
      .webp({ quality: 90 })
      .toFile(destAbs);
    return fs.existsSync(destAbs) && fs.statSync(destAbs).size > 800;
  } catch {
    return false;
  }
}

function searchQueryFromProduct(name: string): string {
  let q = name;
  // Retire préfixes fabricant/gamme répétés
  q = q.replace(/^[^:]+:\s*/g, "");
  q = q.replace(
    /\b(liquidarom|raneki\s*liquide|vape\s*47|e-?tasty|cookin\s*cloud|the\s*mds\s*juice|mds\s*juice|cloud\s*vapor|juice\s*66|airmust|swoke|alfa|liquide\s*lab)\b/gi,
    "",
  );
  q = q.replace(
    /\b(les\s*coll[eè]gues|les\s*essentiels|one\s*taste|ice\s*cool\s*x?|furiosa\s*(eggz|skinz)?|kyoto\s*storm|olympe|call\s*of\s*vape|l['’]?invapable|concentre|concentr[eé])\b/gi,
    "",
  );
  q = q.replace(/\b\d+\s*ml\b/gi, "").replace(/\b\d+\s*mg\b/gi, "");
  q = q.replace(/[-–—|/]+/g, " ").replace(/\s+/g, " ").trim();
  // Prefers last distinctive chunk (saveur / personnage)
  const parts = q.split(/\s{2,}|\s-\s/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) q = parts[parts.length - 1];
  return q.slice(0, 70);
}

async function findRemoteOfficial(
  manufacturerSlug: string,
  productName: string,
): Promise<{ url: string; label: string; score: number } | null> {
  const src = SOURCES[manufacturerSlug];
  if (!src?.search) return null;
  const queries = [
    searchQueryFromProduct(productName),
    productName.replace(/\b\d+\s*ml\b/gi, "").replace(/\s+/g, " ").trim().slice(0, 70),
  ].filter((q, i, a) => q.length >= 3 && a.indexOf(q) === i);

  let best: { url: string; label: string; score: number } | null = null;
  for (const query of queries) {
    try {
      const res = await fetch(src.search(query), {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) continue;
      const html = await res.text().then((h) => h.replace(/\\\//g, "/"));
      const imgs = src.extractImages(html, src.base);
      for (const img of imgs) {
        if (/fr-default|logo|stores|banner/i.test(img.url)) continue;
        const score = scoreFileToProduct(
          img.label,
          productName,
          norm(productName).replace(/\s+/g, "-"),
          productName,
        );
        // Also score against cleaned query tokens
        const qScore = scoreFileToProduct(
          img.label,
          query,
          norm(query).replace(/\s+/g, "-"),
          query,
        );
        const s = Math.max(score, qScore);
        if (s <= 0) continue;
        if (!best || s > best.score) best = { ...img, score: s };
      }
    } catch {
      /* next query */
    }
  }
  return best && best.score >= 6 ? best : null;
}

async function main() {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { category: { contains: "liquide", mode: "insensitive" } },
        { productType: { in: ["10ml", "30ml", "50ml", "70ml", "100ml"] } },
        { volumeMl: { in: [10, 30, 50, 70, 100] } },
      ],
    },
    include: {
      manufacturer: { select: { id: true, slug: true, name: true } },
      rangeRef: { select: { id: true, slug: true, name: true, manufacturerId: true } },
    },
  });

  const eliq = products.filter((p) =>
    isEliquideProduct({
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
    }),
  );

  const queue: QueueItem[] = [];
  const attached: Array<Record<string, unknown>> = [];
  const published: string[] = [];
  const remaining: Array<Record<string, unknown>> = [];

  // Track used media files to avoid cross-product reuse in this run
  const usedFiles = new Set<string>();

  type PhotoCandidate = {
    product: (typeof eliq)[number];
    item: QueueItem;
    kind: "local" | "remote";
    fileOrUrl: string;
    label?: string;
    score: number;
  };
  const photoCandidates: PhotoCandidate[] = [];

  for (const p of eliq) {
    const gate = evaluateEliquidePublishGate({
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
      name: p.name,
      sumupName: p.sumupName,
      sumupProductId: p.sumupProductId,
      imageStatus: p.imageStatus,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
      sumupMapping: p.sumupMapping,
      nameProvenance: parseNameProvenance(p.sumupMapping),
    });

    if (gate.canPublishOnline) {
      if (!p.visibleOnline && APPLY) {
        await prisma.product.update({
          where: { id: p.id },
          data: { visibleOnline: true, catalogStatus: "valide", importAnomaly: null },
        });
        published.push(p.slug);
      } else if (!p.visibleOnline) {
        published.push(p.slug);
      }
      continue;
    }

    const blockReason = gate.reasons[0] || "unknown";
    const item: QueueItem = {
      id: p.id,
      slug: p.slug,
      name: p.name,
      sumupName: p.sumupName,
      sumupProductId: p.sumupProductId,
      manufacturerSlug: p.manufacturer?.slug ?? null,
      rangeSlug: p.rangeRef?.slug ?? null,
      reasons: gate.reasons,
      blockReason,
    };
    queue.push(item);

    const canTryPhoto =
      Boolean(p.sumupProductId) &&
      Boolean(p.sumupName?.trim()) &&
      (p.priceCents ?? 0) > 0 &&
      gate.reasons.includes("photo_officielle_manquante");

    if (!canTryPhoto) {
      remaining.push({
        ...item,
        status: "blocked_non_photo",
        detail: gate.reasons.join("|"),
      });
      continue;
    }

    if (!p.manufacturer?.slug) {
      remaining.push({ ...item, status: "blocked_no_manufacturer" });
      continue;
    }

    if (
      p.rangeRef?.manufacturerId &&
      p.manufacturerId &&
      p.rangeRef.manufacturerId !== p.manufacturerId
    ) {
      remaining.push({ ...item, status: "blocked_mix_range_manufacturer" });
      continue;
    }

    // Local candidates
    for (const file of listMediaFiles(p.manufacturer.slug)) {
      const score = scoreFileToProduct(
        path.basename(file),
        p.name,
        p.slug,
        p.sumupName,
      );
      if (score >= 8) {
        photoCandidates.push({
          product: p,
          item,
          kind: "local",
          fileOrUrl: file,
          score,
        });
      }
    }
  }

  // Greedy assign local files: highest score first, one file → one product
  photoCandidates.sort((a, b) => b.score - a.score);
  const assignedProduct = new Set<string>();
  const localAssignments = new Map<string, PhotoCandidate>();
  for (const c of photoCandidates) {
    if (assignedProduct.has(c.product.id)) continue;
    if (usedFiles.has(c.fileOrUrl)) continue;
    usedFiles.add(c.fileOrUrl);
    assignedProduct.add(c.product.id);
    localAssignments.set(c.product.id, c);
  }

  // Second pass: apply local / remote / remaining
  for (const item of queue) {
    if (remaining.some((r) => r.id === item.id)) continue; // already blocked non-photo

    const p = eliq.find((x) => x.id === item.id)!;
    const local = localAssignments.get(p.id);

    let chosenUrl: string | null = null;
    let source: string | null = null;

    if (local) {
      chosenUrl = toPublicUrl(local.fileOrUrl);
      source = `local_media:${path.basename(local.fileOrUrl)}`;
    } else if (p.manufacturer?.slug) {
      // Corrige fabricant évident (nom Raneki stocké sous e-tasty)
      let mfrSlug = p.manufacturer.slug;
      if (/raneki/i.test(p.name) && mfrSlug === "e-tasty") {
        mfrSlug = "raneki-liquide";
        if (APPLY) {
          const raneki = await prisma.manufacturer.findFirst({
            where: { slug: "raneki-liquide" },
          });
          if (raneki) {
            await prisma.product.update({
              where: { id: p.id },
              data: { manufacturerId: raneki.id },
            });
          }
        }
      }
      const remote = await findRemoteOfficial(mfrSlug, p.name);
      if (remote) {
        const destRel = path.join(
          "media",
          "products",
          p.manufacturer.slug,
          p.rangeRef?.slug || "_unassigned",
          `${p.slug}.webp`,
        );
        const destAbs = path.join(process.cwd(), "public", destRel);
        if (APPLY) {
          const ok = await downloadOfficialWebp(remote.url, destAbs);
          if (ok) {
            chosenUrl = `/${destRel.replace(/\\/g, "/")}`;
            source = `official_remote:${remote.url}`;
          }
        } else {
          chosenUrl = `(dry-run remote ${remote.url})`;
          source = `official_remote_dry:${remote.url}`;
        }
      }
    }

    if (!chosenUrl || chosenUrl.startsWith("(dry-run")) {
      if (chosenUrl?.startsWith("(dry-run")) {
        attached.push({
          slug: p.slug,
          dryRun: true,
          source,
          wouldAttach: chosenUrl,
        });
      }
      remaining.push({
        ...item,
        status: "no_official_visual_found",
        detail: "Recherche locale + site officiel : aucun packshot fiable",
      });
      continue;
    }

    attached.push({ slug: p.slug, source, imageUrl: chosenUrl, score: local?.score });

    if (APPLY && !chosenUrl.startsWith("(")) {
      await prisma.product.update({
        where: { id: p.id },
        data: {
          imageUrl: chosenUrl,
          imageStatus: "official",
          images: [chosenUrl],
        },
      });

      const gate2 = evaluateEliquidePublishGate({
        category: p.category,
        productType: p.productType,
        volumeMl: p.volumeMl,
        name: p.name,
        sumupName: p.sumupName,
        sumupProductId: p.sumupProductId,
        imageStatus: "official",
        imageUrl: chosenUrl,
        priceCents: p.priceCents,
        sumupMapping: p.sumupMapping,
        nameProvenance: parseNameProvenance(p.sumupMapping),
      });

      if (gate2.canPublishOnline) {
        await prisma.product.update({
          where: { id: p.id },
          data: {
            visibleOnline: true,
            catalogStatus: "valide",
            importAnomaly: null,
          },
        });
        published.push(p.slug);
      } else {
        remaining.push({
          ...item,
          status: "attached_but_gate_fail",
          detail: gate2.reasons.join("|"),
          imageUrl: chosenUrl,
        });
      }
    }
  }

  // Remove duplicate remaining entries (same id)
  const remUnique = new Map<string, Record<string, unknown>>();
  for (const r of remaining) remUnique.set(String(r.id), r);
  remaining.length = 0;
  remaining.push(...remUnique.values());

  // Final counts
  const after = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { category: { contains: "liquide", mode: "insensitive" } },
        { productType: { in: ["10ml", "30ml", "50ml", "70ml", "100ml"] } },
        { volumeMl: { in: [10, 30, 50, 70, 100] } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      visibleOnline: true,
      sumupProductId: true,
      sumupName: true,
      imageUrl: true,
      imageStatus: true,
      priceCents: true,
      category: true,
      productType: true,
      volumeMl: true,
      sumupMapping: true,
      manufacturer: { select: { slug: true } },
      rangeRef: { select: { slug: true } },
    },
  });
  const afterEliq = after.filter((p) => isEliquideProduct(p));
  const afterVisible = afterEliq.filter((p) => p.visibleOnline).length;
  const stillNoPhoto: Array<Record<string, unknown>> = [];
  for (const p of afterEliq) {
    const gate = evaluateEliquidePublishGate({
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
      name: p.name,
      sumupName: p.sumupName,
      sumupProductId: p.sumupProductId,
      imageStatus: p.imageStatus,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
      sumupMapping: p.sumupMapping,
      nameProvenance: parseNameProvenance(p.sumupMapping),
    });
    if (!gate.canPublishOnline) {
      stillNoPhoto.push({
        slug: p.slug,
        name: p.name,
        manufacturer: p.manufacturer?.slug,
        range: p.rangeRef?.slug,
        reasons: gate.reasons,
        primaryBlock: gate.reasons[0],
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    totalProducts: afterEliq.length,
    publishedOnline: afterVisible,
    queueSizeInitial: queue.length,
    visualsAttachedThisRun: attached.length,
    publishedThisRun: published.length,
    remainingWithoutOfficialComplete: stillNoPhoto.length,
    remainingByReason: stillNoPhoto.reduce<Record<string, number>>((acc, r) => {
      const k = String(r.primaryBlock || "unknown");
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    attached,
    remaining: stillNoPhoto,
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(QUEUE_JSON, JSON.stringify({ queue, remaining: stillNoPhoto }, null, 2));

  const md = `# RAPPORT — Complétion import e-liquides (visuels officiels)

**Date :** ${report.generatedAt}  
**Mode :** ${APPLY ? "APPLY" : "DRY-RUN"}

## Synthèse

| Indicateur | Valeur |
|---|---:|
| Produits e-liquides actifs | ${report.totalProducts} |
| Publiés en ligne | ${report.publishedOnline} |
| Visuels associés (run) | ${report.visualsAttachedThisRun} |
| Publications (run) | ${report.publishedThisRun} |
| Restant non publiable | ${report.remainingWithoutOfficialComplete} |

## Blocages restants

${Object.entries(report.remainingByReason)
  .map(([k, v]) => `- \`${k}\` : ${v}`)
  .join("\n")}

## File restante (extrait)

| Produit | Fabricant | Gamme | Raison |
|---|---|---|---|
${stillNoPhoto
  .slice(0, 80)
  .map(
    (r) =>
      `| ${r.name} | ${r.manufacturer || "—"} | ${r.range || "—"} | ${(r.reasons as string[]).join(", ")} |`,
  )
  .join("\n")}

> Les produits sans ID SumUp ne peuvent pas être publiés (politique officielle — pas d'invention).
> Les produits sans packshot officiel fiable restent en file \`data/rebuild/QUEUE_PHOTOS_ELIQUIDES.json\`.
`;
  fs.writeFileSync(REPORT_MD, md);

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        totalProducts: report.totalProducts,
        publishedOnline: report.publishedOnline,
        attached: attached.length,
        publishedThisRun: published.length,
        remaining: stillNoPhoto.length,
        remainingByReason: report.remainingByReason,
        sampleAttached: attached.slice(0, 15),
        sampleRemaining: stillNoPhoto.slice(0, 15),
      },
      null,
      2,
    ),
  );
  console.log(`→ ${REPORT_JSON}`);
  console.log(`→ ${REPORT_MD}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
