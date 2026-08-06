/**
 * Étape 1 — Complétion e-Tasty uniquement (Numbers / Gang / United).
 * Usage: npx tsx scripts/complete-manufacturer-etasty-photos.ts [--apply]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import "./load-env";
import prisma from "../lib/prisma";
import {
  evaluateEliquidePublishGate,
  parseNameProvenance,
} from "../lib/catalog/official-sumup-policy";

const APPLY = process.argv.includes("--apply");
const UA = "AllVapsCatalogBot/1.0 (+etasty-completion)";
const OUT_MD = path.resolve("catalogues/rapports/RAPPORT_ETASTY_COMPLETION.md");
const MEDIA = path.join(process.cwd(), "public", "media", "products", "e-tasty");

function extractNum(name: string, slug: string): string | null {
  const m = (name + " " + slug).match(/numbers?\s*(\d+)/i);
  return m ? m[1] : null;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.text()).replace(/\\\//g, "/");
}

function findImageUrls(html: string): Array<{ url: string; label: string }> {
  const out: Array<{ url: string; label: string }> = [];
  for (const m of html.matchAll(
    /(?:https?:\/\/(?:www\.)?e-tasty\.fr)?\/(\d+)-(?:home_default_2x|large_default|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
  )) {
    if (/fr-default|logo/i.test(m[0])) continue;
    const host = "https://www.e-tasty.fr";
    const url = `${host}/${m[1]}-home_default_2x/${m[2]}.${m[3]}`;
    out.push({ url, label: m[2] });
  }
  return out;
}

async function download(url: string, dest: string): Promise<boolean> {
  const candidates = [
    url,
    url.replace("home_default_2x", "home_default"),
    url.replace("home_default_2x", "large_default"),
    url.replace("https://www.e-tasty.fr/", "https://e-tasty.fr/"),
  ];
  for (const u of [...new Set(candidates)]) {
    try {
      const res = await fetch(u, {
        headers: {
          "User-Agent": UA,
          Accept: "image/*",
          Referer: "https://www.e-tasty.fr/",
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 3000) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await sharp(buf)
        .rotate()
        .resize(1000, 1000, {
          fit: "inside",
          background: { r: 11, g: 16, b: 22 },
        })
        .flatten({ background: { r: 11, g: 16, b: 22 } })
        .webp({ quality: 90 })
        .toFile(dest);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 800) return true;
    } catch {
      /* next */
    }
  }
  return false;
}

function scoreForProduct(
  label: string,
  product: { name: string; slug: string; volumeMl: number | null },
): number {
  const fn = label.toLowerCase();
  const num = extractNum(product.name, product.slug);
  if (num) {
    // Exact Numbers N + reject N0 (10 for 1)
    const re = new RegExp(`numbers[-_]?0*${num}(?:[^0-9]|$)`, "i");
    if (!re.test(fn)) return 0;
    if (num === "1" && /numbers[-_]?1\d/i.test(fn)) return 0;
    // Format: concentrés = 30ml only — never accept 100ml packshot
    const want30 = /30\s*ml|concentre/i.test(product.name + " " + product.slug);
    if (want30) {
      if (/100\s*ml|100ml/i.test(fn) && !/30\s*ml|30ml/i.test(fn)) return 0;
      if (!/30\s*ml|30ml/i.test(fn)) return 0;
      // Exact slug-style label is strongest
      if (new RegExp(`^numbers[-_]?0*${num}[-_]?30ml$`, "i").test(fn)) return 30;
      return 20;
    }
    return 10;
  }
  if (/united/i.test(product.name) && /united/i.test(fn)) {
    // Reject Easy United kits / menthol / salts when product is classic United
    if (/easy[-_]?united|menthol|sels?|nicotine|kit|recharge/i.test(fn)) return 0;
    const want50 = /50\s*ml|50ml/i.test(product.name + " " + product.slug) || product.volumeMl === 50;
    const want10 = /10\s*ml|10ml/i.test(product.name + " " + product.slug) || product.volumeMl === 10;
    if (want50) {
      if (/10\s*ml|10ml/i.test(fn) && !/50\s*ml|50ml/i.test(fn)) return 0;
      if (/^united[-_]?50ml$/i.test(fn)) return 30;
      if (/50\s*ml|50ml/i.test(fn)) return 20;
      return 0;
    }
    if (want10) {
      if (/50\s*ml|50ml/i.test(fn) && !/10\s*ml|10ml/i.test(fn)) return 0;
      if (/united[-_]?10ml/i.test(fn)) return 20;
    }
    if (/one[-_]?taste/i.test(fn)) return 12;
    return 0;
  }
  if (/vinc|malice|gang/i.test(product.name)) {
    if (/vinc|malice/i.test(fn) && /gang/i.test(fn)) return 15;
    if (/vinc|malice/i.test(fn)) return 12;
  }
  return 0;
}

async function main() {
  const mfr = await prisma.manufacturer.findFirst({ where: { slug: "e-tasty" } });
  if (!mfr) throw new Error("e-tasty manufacturer missing");

  const products = await prisma.product.findMany({
    where: {
      manufacturerId: mfr.id,
      isActive: true,
      visibleOnline: false,
      sumupProductId: { not: null },
    },
    include: { rangeRef: true },
  });

  const blocked = products.filter((p) => {
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
    return !gate.canPublishOnline && gate.reasons.includes("photo_officielle_manquante");
  });

  // Build image pool from official search (prefer exact 30ml / 50ml pages)
  const queries = [
    "Numbers 5 - 30ml",
    "Numbers 6 - 30ml",
    "Numbers 7 - 30ml",
    "Numbers 8 - 30ml",
    "Numbers 9 - 30ml",
    "United 50ml",
    "united-50ml",
    "Gang Organise Vinc",
    "Vinc la malice",
  ];
  const pool: Array<{ url: string; label: string }> = [];
  const seen = new Set<string>();
  for (const q of queries) {
    try {
      const html = await fetchHtml(
        `https://www.e-tasty.fr/recherche?controller=search&s=${encodeURIComponent(q)}`,
      );
      for (const img of findImageUrls(html)) {
        if (seen.has(img.url)) continue;
        seen.add(img.url);
        pool.push(img);
      }
      console.log("query", q, "→", findImageUrls(html).length);
    } catch (e) {
      console.log("query fail", q, e);
    }
  }

  // Local files
  const localFiles: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/\.(webp|jpe?g|png)$/i.test(ent.name) && !/-thumb/i.test(ent.name)) {
        localFiles.push(full);
      }
    }
  };
  walk(MEDIA);
  // also public/images/products/etasty if exists
  walk(path.join(process.cwd(), "public", "images", "products", "etasty"));

  const completed: Array<Record<string, unknown>> = [];
  const stillBlocked: Array<Record<string, unknown>> = [];
  const usedRemote = new Set<string>();
  const usedLocal = new Set<string>();

  for (const p of blocked) {
    // Prefer local exact match
    let chosen: { kind: string; pathOrUrl: string; label: string; score: number } | null = null;

    for (const file of localFiles) {
      if (usedLocal.has(file)) continue;
      const base = path.basename(file);
      const score = scoreForProduct(base, p);
      if (score < 12) continue;
      if (!chosen || score > chosen.score) {
        chosen = { kind: "local", pathOrUrl: file, label: base, score };
      }
    }

    if (!chosen) {
      for (const img of pool) {
        if (usedRemote.has(img.url)) continue;
        const score = scoreForProduct(img.label, p);
        if (score < 12) continue;
        if (!chosen || score > chosen.score) {
          chosen = { kind: "remote", pathOrUrl: img.url, label: img.label, score };
        }
      }
    }

    if (!chosen) {
      stillBlocked.push({
        slug: p.slug,
        name: p.name,
        range: p.rangeRef?.slug,
        reason: "aucune_image_officielle_certaine",
      });
      continue;
    }

    const rangeSlug = p.rangeRef?.slug || "_unassigned";
    const destRel = `media/products/e-tasty/${rangeSlug}/${p.slug}.webp`;
    const destAbs = path.join(process.cwd(), "public", destRel);
    const publicUrl = `/${destRel}`;

    let ok = false;
    let sourceUrl: string | null = null;

    if (chosen.kind === "local") {
      // If already correct path under media, reuse; else copy/convert
      const rel = chosen.pathOrUrl.replace(/\\/g, "/").split("/public/")[1];
      if (rel && chosen.pathOrUrl.includes(p.slug)) {
        ok = true;
        sourceUrl = `local:/${rel}`;
        if (APPLY) {
          await prisma.product.update({
            where: { id: p.id },
            data: {
              imageUrl: `/${rel}`,
              imageStatus: "official",
              images: [`/${rel}`],
              sumupMapping: p.sumupMapping,
            },
          });
        }
        usedLocal.add(chosen.pathOrUrl);
        // gate + publish below using publicUrl override
        const useUrl = `/${rel}`;
        const gate = evaluateEliquidePublishGate({
          category: p.category,
          productType: p.productType,
          volumeMl: p.volumeMl,
          name: p.name,
          sumupName: p.sumupName,
          sumupProductId: p.sumupProductId,
          imageStatus: "official",
          imageUrl: useUrl,
          priceCents: p.priceCents,
          sumupMapping: p.sumupMapping,
          nameProvenance: parseNameProvenance(p.sumupMapping),
        });
        let published = false;
        if (APPLY && gate.canPublishOnline) {
          await prisma.product.update({
            where: { id: p.id },
            data: { visibleOnline: true, catalogStatus: "valide", importAnomaly: null },
          });
          published = true;
        }
        completed.push({
          slug: p.slug,
          name: p.name,
          source: sourceUrl,
          imageUrl: useUrl,
          score: chosen.score,
          published: APPLY ? published : gate.canPublishOnline,
          gate: gate.reasons,
        });
        continue;
      }
      // convert local file to dest
      if (APPLY) {
        fs.mkdirSync(path.dirname(destAbs), { recursive: true });
        await sharp(chosen.pathOrUrl)
          .rotate()
          .resize(1000, 1000, { fit: "inside", background: { r: 11, g: 16, b: 22 } })
          .flatten({ background: { r: 11, g: 16, b: 22 } })
          .webp({ quality: 90 })
          .toFile(destAbs);
        ok = fs.existsSync(destAbs);
        sourceUrl = `local:${chosen.label}`;
        usedLocal.add(chosen.pathOrUrl);
      } else {
        ok = true;
        sourceUrl = `local_dry:${chosen.label}`;
      }
    } else {
      sourceUrl = chosen.pathOrUrl;
      if (APPLY) {
        ok = await download(chosen.pathOrUrl, destAbs);
        if (ok) usedRemote.add(chosen.pathOrUrl);
      } else {
        ok = true;
      }
    }

    if (!ok) {
      stillBlocked.push({
        slug: p.slug,
        name: p.name,
        reason: "telechargement_echec",
        attempted: sourceUrl,
      });
      continue;
    }

    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: {
          imageUrl: publicUrl,
          imageStatus: "official",
          images: [publicUrl],
        },
      });
    }

    const gate = evaluateEliquidePublishGate({
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
      name: p.name,
      sumupName: p.sumupName,
      sumupProductId: p.sumupProductId,
      imageStatus: "official",
      imageUrl: publicUrl,
      priceCents: p.priceCents,
      sumupMapping: p.sumupMapping,
      nameProvenance: parseNameProvenance(p.sumupMapping),
    });

    let published = false;
    if (APPLY && gate.canPublishOnline) {
      await prisma.product.update({
        where: { id: p.id },
        data: { visibleOnline: true, catalogStatus: "valide", importAnomaly: null },
      });
      published = true;
    } else if (!gate.canPublishOnline) {
      stillBlocked.push({
        slug: p.slug,
        name: p.name,
        reason: "image_ok_mais_gate_ko",
        gate: gate.reasons,
      });
    }

    completed.push({
      slug: p.slug,
      name: p.name,
      source: sourceUrl,
      imageUrl: publicUrl,
      score: chosen.score,
      label: chosen.label,
      published: APPLY ? published : gate.canPublishOnline,
      gateOk: gate.canPublishOnline,
    });
  }

  const md = `# RAPPORT e-Tasty — Complétion

**Date :** ${new Date().toISOString()}  
**Mode :** ${APPLY ? "APPLY" : "DRY-RUN"}

## Synthèse

| Indicateur | Valeur |
|---|---:|
| Références contrôlées (bloquées photo + SumUp) | ${blocked.length} |
| Complétées (image associée) | ${completed.length} |
| Encore bloquées | ${stillBlocked.length} |
| Publiées (ou publiables) | ${completed.filter((c) => c.published).length} |

## Références contrôlées

${blocked.map((p) => `- ${p.name} (\`${p.slug}\`) · gamme ${p.rangeRef?.slug || "—"}`).join("\n")}

## Complétées

${completed.map((c) => `- **${c.name}** ← \`${c.label || c.source}\` · publié=${c.published}`).join("\n") || "_aucune_"}

## Encore bloquées

${stillBlocked.map((b) => `- **${b.name || b.slug}** — ${b.reason} ${b.gate ? `(${(b.gate as string[]).join(", ")})` : ""}`).join("\n") || "_aucune_"}

## Sources

- https://www.e-tasty.fr/recherche
- Locaux : \`public/media/products/e-tasty/\`

## Vérifications

- Numbers N : match regex strict + rejet format 100 ml pour concentrés 30 ml
- Pas de réutilisation d’URL/fichier entre produits (usedRemote / usedLocal)
- Gate \`evaluateEliquidePublishGate\` avant publication
- Aucun SumUp inventé
`;

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_MD, md);
  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        controlled: blocked.length,
        completed: completed.length,
        stillBlocked: stillBlocked.length,
        completedDetails: completed,
        stillBlockedDetails: stillBlocked,
      },
      null,
      2,
    ),
  );
  console.log("→", OUT_MD);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
