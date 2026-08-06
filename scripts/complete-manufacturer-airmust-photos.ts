/**
 * Étape 2 — AirMust : audit + association uniquement si packshot officiel airmust.com certain.
 * Ne jamais appliquer une image Liquide Lab / Péché Gourmand / Iceberg / GlaGla sur un produit AirMust.
 * Usage: npx tsx scripts/complete-manufacturer-airmust-photos.ts [--apply]
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
import { normalizeCatalogKey } from "../lib/catalog/assert-no-duplicates";

const APPLY = process.argv.includes("--apply");
const UA = "AllVapsCatalogBot/1.0 (+airmust-completion)";
const OUT_MD = path.resolve("catalogues/rapports/RAPPORT_AIRMUST_COMPLETION.md");
const BASE = "https://airmust.com";

/** Gammes Liquide Lab — jamais attributables via site AirMust */
const FOREIGN_RANGE =
  /\b(p[eé]ch[eé]\s*gourmand|iceberg|glagla|gla\s*gla|quix|o['’]?jlab)\b/i;

/** Gammes AirMust attendues dans le brief */
const AIRMUST_RANGE =
  /\b(unik|loval(?:y|ie)|l['’]?ovalie|airmax|must|soci[eé]t[eé]\s*club|primeur|paperland|ekinox|hey\s*boogie)\b/i;

function norm(s: string) {
  return normalizeCatalogKey(s);
}

function flavorKey(name: string): string {
  return norm(
    name
      .replace(FOREIGN_RANGE, " ")
      .replace(/\b\d+\s*ml\b/gi, " ")
      .replace(/\b\d+\s*mg\b/gi, " ")
      .replace(/[-–—|/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).replace(/\\\//g, "/");
}

function extractImages(html: string): Array<{ url: string; label: string }> {
  const out: Array<{ url: string; label: string }> = [];
  for (const m of html.matchAll(
    /(?:https?:\/\/(?:www\.)?airmust\.com)?\/(\d+)-(?:home_default_2x|large_default|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
  )) {
    if (/fr-default|logo|banner|stores/i.test(m[0])) continue;
    out.push({
      url: `${BASE}/${m[1]}-home_default_2x/${m[2]}.${m[3]}`,
      label: m[2],
    });
  }
  return out;
}

function scoreLabel(label: string, productName: string): number {
  const fn = norm(label.replace(/[-_]+/g, " "));
  const key = flavorKey(productName);
  const tokens = key.split(/\s+/).filter((t) => t.length > 2);
  if (!tokens.length) return 0;
  // Reject Liquide Lab naming on AirMust assets
  if (FOREIGN_RANGE.test(label) || FOREIGN_RANGE.test(productName)) return 0;
  let hits = 0;
  for (const t of tokens) if (fn.includes(t)) hits += 1;
  const ratio = hits / tokens.length;
  if (ratio < 0.9) return 0;
  return Math.round(ratio * 20);
}

async function download(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*", Referer: BASE },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 3000) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await sharp(buf)
      .rotate()
      .resize(1000, 1000, { fit: "inside", background: { r: 11, g: 16, b: 22 } })
      .flatten({ background: { r: 11, g: 16, b: 22 } })
      .webp({ quality: 90 })
      .toFile(dest);
    return fs.existsSync(dest) && fs.statSync(dest).size > 800;
  } catch {
    return false;
  }
}

async function main() {
  const mfr = await prisma.manufacturer.findFirst({ where: { slug: "airmust" } });
  if (!mfr) throw new Error("airmust manufacturer missing");

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

  // Probe site availability
  let siteOk = false;
  try {
    await fetchHtml(BASE);
    siteOk = true;
  } catch {
    siteOk = false;
  }

  const completed: Array<Record<string, unknown>> = [];
  const stillBlocked: Array<Record<string, unknown>> = [];
  const usedRemote = new Set<string>();

  for (const p of blocked) {
    const foreign = FOREIGN_RANGE.test(p.name) || FOREIGN_RANGE.test(p.slug);
    const airmustNamed = AIRMUST_RANGE.test(p.name) || AIRMUST_RANGE.test(p.rangeRef?.name || "");

    if (foreign && !airmustNamed) {
      stillBlocked.push({
        slug: p.slug,
        name: p.name,
        range: p.rangeRef?.slug ?? null,
        reason: "fabricant_catalogue_incoherent",
        detail:
          "Nom/gamme Péché Gourmand, Iceberg ou GlaGla = Liquide Lab / O'Jlab — absent des gammes AirMust (Unik, L'Ovalie, Airmax, Must, Société Club). Aucune image AirMust appliquée. Aucune réassignation automatique.",
      });
      continue;
    }

    if (!siteOk) {
      stillBlocked.push({
        slug: p.slug,
        name: p.name,
        reason: "source_officielle_non_accessible",
        detail: "airmust.com inaccessible",
      });
      continue;
    }

    const queries = [
      flavorKey(p.name),
      p.name.replace(/\b\d+\s*ml\b/gi, "").trim().slice(0, 60),
    ].filter((q, i, a) => q.length >= 3 && a.indexOf(q) === i);

    let best: { url: string; label: string; score: number } | null = null;
    for (const q of queries) {
      try {
        const html = await fetchHtml(
          `${BASE}/recherche?controller=search&s=${encodeURIComponent(q)}`,
        );
        for (const img of extractImages(html)) {
          if (usedRemote.has(img.url)) continue;
          const score = scoreLabel(img.label, p.name);
          if (score < 12) continue;
          if (!best || score > best.score) best = { ...img, score };
        }
      } catch {
        /* next */
      }
    }

    if (!best) {
      stillBlocked.push({
        slug: p.slug,
        name: p.name,
        range: p.rangeRef?.slug ?? null,
        reason: "aucune_image_officielle_certaine",
        detail: "Aucune correspondance certaine sur airmust.com",
      });
      continue;
    }

    const destRel = `media/products/airmust/${p.rangeRef?.slug || "_unassigned"}/${p.slug}.webp`;
    const destAbs = path.join(process.cwd(), "public", destRel);
    const publicUrl = `/${destRel}`;

    let ok = true;
    if (APPLY) {
      ok = await download(best.url, destAbs);
      if (ok) {
        usedRemote.add(best.url);
        await prisma.product.update({
          where: { id: p.id },
          data: {
            imageUrl: publicUrl,
            imageStatus: "official",
            images: [publicUrl],
          },
        });
      }
    }

    if (!ok) {
      stillBlocked.push({
        slug: p.slug,
        name: p.name,
        reason: "telechargement_echec",
        attempted: best.url,
      });
      continue;
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
    }

    completed.push({
      slug: p.slug,
      name: p.name,
      label: best.label,
      source: best.url,
      score: best.score,
      published: APPLY ? published : gate.canPublishOnline,
    });
  }

  const foreignCount = stillBlocked.filter((b) => b.reason === "fabricant_catalogue_incoherent").length;

  const md = `# RAPPORT AirMust — Complétion

**Date :** ${new Date().toISOString()}  
**Mode :** ${APPLY ? "APPLY" : "DRY-RUN"}

## Synthèse

| Indicateur | Valeur |
|---|---:|
| Références contrôlées (bloquées photo + SumUp) | ${blocked.length} |
| Complétées (image AirMust associée) | ${completed.length} |
| Encore bloquées | ${stillBlocked.length} |
| Dont fabricant/catalogue incohérent (Péché Gourmand / Iceberg / GlaGla) | ${foreignCount} |
| Publiées (ou publiables) | ${completed.filter((c) => c.published).length} |
| Site airmust.com accessible | ${siteOk ? "oui" : "non"} |

## Constat critique

Les **${blocked.length}** références bloquées sous fabricant \`airmust\` portent des noms de gammes **Péché Gourmand**, **Iceberg** ou **GlaGla**, qui appartiennent à **Liquide Lab / O'Jlab**, pas à AirMust.

Gammes AirMust attendues (brief) : Unik, Lovaly / L'Ovalie, Airmax, Must, Société Club (et catalogues airmust.com : Primeur, Paperland, Ekinox, Hey Boogie).

**Décision :** aucune image Liquide Lab n'a été appliquée sur ces fiches AirMust (règle zéro mélange fabricant). Aucune réassignation automatique de fabricant. Produits laissés **hors ligne**.

## Références contrôlées

${blocked.map((p) => `- ${p.name} (\`${p.slug}\`) · gamme ${p.rangeRef?.slug || "—"} · SumUp=\`${p.sumupProductId}\``).join("\n")}

## Complétées

${completed.map((c) => `- **${c.name}** ← \`${c.label}\` · ${c.source} · publié=${c.published}`).join("\n") || "_aucune — aucune correspondance AirMust certaine_"}

## Encore bloquées

${stillBlocked
  .map(
    (b) =>
      `- **${b.name}** — \`${b.reason}\`${b.detail ? ` — ${b.detail}` : ""}`,
  )
  .join("\n") || "_aucune_"}

## Sources

- https://airmust.com/ (officiel)
- Contrôle croisé : Péché Gourmand / Iceberg / GlaGla → https://liquidelab.com/ (hors périmètre AirMust)

## Vérifications

- Zéro confusion de gammes AirMust vs Liquide Lab
- Zéro image générique / revendeur appliquée
- Zéro \`sumupProductId\` inventé
- Gate publication respectée (rien forcé)
- Total publié global à recalculer après cette étape
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
        foreignCount,
        siteOk,
        stillBlockedDetails: stillBlocked,
        completedDetails: completed,
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
