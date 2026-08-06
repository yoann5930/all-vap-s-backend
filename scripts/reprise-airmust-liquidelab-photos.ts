/**
 * Reprise Liquid Lab + AirMust — audit produit par produit, zéro image inventée.
 * Usage:
 *   npx tsx scripts/reprise-airmust-liquidelab-photos.ts
 *   npx tsx scripts/reprise-airmust-liquidelab-photos.ts --apply
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";
import {
  evaluateEliquidePublishGate,
  parseNameProvenance,
} from "../lib/catalog/official-sumup-policy";
import { normalizeCatalogKey } from "../lib/catalog/assert-no-duplicates";

const APPLY = process.argv.includes("--apply");
const UA = "AllVapsCatalogBot/1.0 (+reprise-airmust-liquidelab)";
const REASON = "OFFICIAL_PACKSHOT_NOT_ACCESSIBLE";

const LL_FOREIGN_OK = /\b(iceberg|gla\s*gla|glagla|kuix|quix|p[eé]ch[eé]\s*gourmand|big\s*kawa)\b/i;
const AM_EXPECTED = /\b(unik|loval|ovalie|airmax|must|soci[eé]t[eé]\s*club|press\s*start|ferox|hopper|paperland)\b/i;
const LL_ON_AIRMUST = /\b(p[eé]ch[eé]\s*gourmand|iceberg|gla\s*gla|glagla|kuix|quix)\b/i;

type RowResult = {
  slug: string;
  name: string;
  manufacturer: string;
  range: string | null;
  volumeMl: number | null;
  sumupProductId: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  imageStatus: string | null;
  visibleOnline: boolean;
  localCandidates: string[];
  officialProbe: string;
  decision: "completed" | "blocked";
  reason: string;
  detail: string;
  published?: boolean;
  source?: string | null;
};

function norm(s: string) {
  return normalizeCatalogKey(s);
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(webp|jpe?g|png)$/i.test(ent.name) && !/-thumb$/i.test(ent.name)) out.push(full);
  }
  return out;
}

function flavorTokens(name: string): string[] {
  return norm(
    name
      .replace(LL_FOREIGN_OK, " ")
      .replace(AM_EXPECTED, " ")
      .replace(/\b(liquide\s*lab|airmust|o['’]?jlab)\b/gi, " ")
      .replace(/\b\d+\s*ml\b/gi, " ")
      .replace(/\b\d+\s*mg\b/gi, " "),
  )
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreLocal(file: string, productName: string, mfr: "liquide-lab" | "airmust"): number {
  const base = path.basename(file).replace(/\.(webp|jpe?g|png)$/i, "");
  const fn = norm(base.replace(/[-_]+/g, " "));
  // Never use gamme / group covers
  if (/^(iceberg|glagla|gla gla|peche gourmands?|iceberg mix|iceberg salt|kuix)$/i.test(fn)) return 0;
  if (/gamme|collection|pack|groupe|lineup|cover|logo/i.test(fn)) return 0;
  if (mfr === "airmust" && LL_ON_AIRMUST.test(productName)) return 0;
  if (mfr === "airmust" && /liquide.?lab|peche|iceberg|glagla|kuix/i.test(file.replace(/\\/g, "/"))) return 0;
  if (mfr === "liquide-lab" && /\/airmust\//i.test(file.replace(/\\/g, "/"))) return 0;

  const tokens = flavorTokens(productName);
  if (!tokens.length) return 0;
  let hits = 0;
  for (const t of tokens) if (fn.includes(t)) hits += 1;
  const ratio = hits / tokens.length;
  if (ratio < 0.9) return 0;
  // Prefer matching range folder
  const folder = file.replace(/\\/g, "/").toLowerCase();
  if (/iceberg/i.test(productName) && /iceberg/.test(folder)) return Math.round(ratio * 20) + 3;
  if (/glagla|gla\s*gla/i.test(productName) && /glagla/.test(folder)) return Math.round(ratio * 20) + 3;
  if (/p[eé]ch[eé]/i.test(productName) && /peche/.test(folder)) return Math.round(ratio * 20) + 3;
  return Math.round(ratio * 20);
}

async function probeOfficial(mfr: "liquide-lab" | "airmust", name: string): Promise<string> {
  try {
    if (mfr === "liquide-lab") {
      const home = await fetch("https://www.liquidelab.com/", {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(15000),
      });
      const search = await fetch(
        `https://www.liquidelab.com/recherche?controller=search&s=${encodeURIComponent(name.slice(0, 40))}`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) },
      );
      return `liquidelab.com home=${home.status}; search=${search.status} (portail B2B — packshots individuels non publics; visuels /img/gamme/* exclus)`;
    }
    const q = encodeURIComponent(flavorTokens(name).join(" ").slice(0, 40) || name.slice(0, 40));
    const home = await fetch("https://airmust.com/", {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    const search = await fetch(`https://airmust.com/recherche?controller=search&s=${q}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    const html = search.ok ? await search.text() : "";
    const hasProduct = /product-miniature|product-title|home_default/i.test(html);
    const empty =
      /aucun produit|no products|pas de produit/i.test(html) ||
      (!hasProduct && search.ok);
    if (LL_ON_AIRMUST.test(name)) {
      return `airmust.com home=${home.status}; search=${search.status}; résultat=${empty ? "aucun produit AirMust (gamme Liquide Lab détectée)" : "hits génériques — non retenus"}`;
    }
    return `airmust.com home=${home.status}; search=${search.status}; hits=${hasProduct && !empty}`;
  } catch (e) {
    return `probe_fail: ${String(e)}`;
  }
}

async function processMfr(slug: "liquide-lab" | "airmust"): Promise<RowResult[]> {
  const mfr = await prisma.manufacturer.findFirst({ where: { slug } });
  if (!mfr) throw new Error(`${slug} missing`);

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

  const roots = [
    path.join(process.cwd(), "public", "media", "products", slug),
    path.join(process.cwd(), "public", "images", "products", slug),
    path.join(process.cwd(), "public", "media", "products", "_raw", slug),
    path.join(process.cwd(), "public", "media", "products", "_backup_pre_normalize", slug),
    path.join(process.cwd(), "exports"),
    path.join(process.cwd(), "imports"),
    path.join(process.cwd(), "backups"),
    path.join(process.cwd(), "assets"),
  ];
  if (slug === "liquide-lab") {
    roots.push(path.join(process.cwd(), "public", "media", "products", "liquidelab"));
    roots.push(path.join(process.cwd(), "public", "media", "products", "liquid-lab"));
  }

  const allLocal: string[] = [];
  for (const r of roots) walk(r, allLocal);

  const results: RowResult[] = [];
  const used = new Set<string>();

  for (const p of blocked) {
    const localHits = allLocal
      .map((f) => ({ f, score: scoreLocal(f, p.name, slug) }))
      .filter((x) => x.score >= 12)
      .sort((a, b) => b.score - a.score);

    const probe = await probeOfficial(slug, p.name);

    // AirMust: Liquide Lab naming → block without applying LL images
    if (slug === "airmust" && LL_ON_AIRMUST.test(p.name)) {
      results.push({
        slug: p.slug,
        name: p.name,
        manufacturer: slug,
        range: p.rangeRef?.slug ?? null,
        volumeMl: p.volumeMl,
        sumupProductId: p.sumupProductId,
        priceCents: p.priceCents,
        imageUrl: p.imageUrl,
        imageStatus: p.imageStatus,
        visibleOnline: p.visibleOnline,
        localCandidates: localHits.map((x) => x.f),
        officialProbe: probe,
        decision: "blocked",
        reason: REASON,
        detail:
          "Nom/gamme Liquide Lab (Péché Gourmand / Iceberg / GlaGla / Kuix) sous fabricant AirMust — packshot AirMust introuvable; interdiction d’utiliser un visuel Liquide Lab.",
        source: null,
      });
      continue;
    }

    const best = localHits.find((x) => !used.has(x.f)) || null;
    if (best) {
      const rel = best.f.replace(/\\/g, "/").split("/public/")[1];
      const useUrl = rel ? `/${rel}` : null;
      if (useUrl && APPLY) {
        await prisma.product.update({
          where: { id: p.id },
          data: {
            imageUrl: useUrl,
            imageStatus: "official",
            images: [useUrl],
            sumupMapping: p.sumupMapping
              ? (() => {
                  try {
                    const m = JSON.parse(p.sumupMapping);
                    return JSON.stringify({
                      ...m,
                      imageSource: `local:${useUrl}`,
                      imageOfficialUrl: useUrl,
                    });
                  } catch {
                    return p.sumupMapping;
                  }
                })()
              : JSON.stringify({ imageSource: `local:${useUrl}` }),
          },
        });
        used.add(best.f);
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
        if (gate.canPublishOnline) {
          await prisma.product.update({
            where: { id: p.id },
            data: { visibleOnline: true, catalogStatus: "valide", importAnomaly: null },
          });
          published = true;
        }
        results.push({
          slug: p.slug,
          name: p.name,
          manufacturer: slug,
          range: p.rangeRef?.slug ?? null,
          volumeMl: p.volumeMl,
          sumupProductId: p.sumupProductId,
          priceCents: p.priceCents,
          imageUrl: useUrl,
          imageStatus: "official",
          visibleOnline: published,
          localCandidates: localHits.map((x) => x.f),
          officialProbe: probe,
          decision: "completed",
          reason: "local_official_packshot",
          detail: `Match local score=${best.score}`,
          published,
          source: `local:${useUrl}`,
        });
        continue;
      }
      if (useUrl && !APPLY) {
        results.push({
          slug: p.slug,
          name: p.name,
          manufacturer: slug,
          range: p.rangeRef?.slug ?? null,
          volumeMl: p.volumeMl,
          sumupProductId: p.sumupProductId,
          priceCents: p.priceCents,
          imageUrl: p.imageUrl,
          imageStatus: p.imageStatus,
          visibleOnline: false,
          localCandidates: localHits.map((x) => x.f),
          officialProbe: probe,
          decision: "completed",
          reason: "local_official_packshot",
          detail: `DRY-RUN match local score=${best.score}`,
          published: false,
          source: `local_dry:${useUrl}`,
        });
        used.add(best.f);
        continue;
      }
    }

    results.push({
      slug: p.slug,
      name: p.name,
      manufacturer: slug,
      range: p.rangeRef?.slug ?? null,
      volumeMl: p.volumeMl,
      sumupProductId: p.sumupProductId,
      priceCents: p.priceCents,
      imageUrl: p.imageUrl,
      imageStatus: p.imageStatus,
      visibleOnline: false,
      localCandidates: [],
      officialProbe: probe,
      decision: "blocked",
      reason: REASON,
      detail:
        slug === "liquide-lab"
          ? "Aucun packshot individuel local Iceberg/GlaGla/Péché ; site liquidelab.com = B2B + visuels de gamme uniquement."
          : "Aucun packshot individuel AirMust certain trouvé localement ni sur airmust.com pour cette référence.",
      source: null,
    });
  }

  return results;
}

function writeReport(
  file: string,
  title: string,
  rows: RowResult[],
  extras: string[],
) {
  const completed = rows.filter((r) => r.decision === "completed");
  const blocked = rows.filter((r) => r.decision === "blocked");
  const published = rows.filter((r) => r.published);
  const md = `# ${title}

**Date :** ${new Date().toISOString()}  
**Mode :** ${APPLY ? "APPLY" : "DRY-RUN / AUDIT"}

## Synthèse

| Indicateur | Valeur |
|---|---:|
| Références contrôlées | ${rows.length} |
| Complétées (packshot officiel exact) | ${completed.length} |
| Encore bloquées | ${blocked.length} |
| Publiées | ${published.length} |

## Méthode de recherche

1. Dossiers locaux \`public/media/products/\`, \`_raw\`, \`_backup_pre_normalize\`
2. exports / imports / backups / assets
3. Médias déjà téléchargés
4. Pages officielles accessibles sans authentification
5. Interdiction : visuels de gamme, photos de groupe, revendeurs non vérifiés, login privé

## Références contrôlées (détail)

${rows
  .map(
    (r) => `### ${r.name}

| Champ | Valeur |
|---|---|
| Slug | \`${r.slug}\` |
| Fabricant | ${r.manufacturer} |
| Gamme | ${r.range || "—"} |
| Format | ${r.volumeMl ?? "—"} ml |
| SumUp | ${r.sumupProductId ? `\`${r.sumupProductId}\`` : "**absent**"} |
| Prix (cents) | ${r.priceCents ?? "—"} |
| imageUrl | ${r.imageUrl || "—"} |
| imageStatus | ${r.imageStatus || "—"} |
| visibleOnline | ${r.visibleOnline} |
| Candidats locaux | ${r.localCandidates.length ? r.localCandidates.map((c) => `\`${c}\``).join("<br>") : "_aucun_"} |
| Sonde officielle | ${r.officialProbe} |
| Décision | **${r.decision}** |
| Raison | \`${r.reason}\` |
| Détail | ${r.detail} |
| Source | ${r.source || "—"} |
`,
  )
  .join("\n")}

## Complétées

${completed.map((c) => `- **${c.name}** ← ${c.source} · publié=${c.published}`).join("\n") || "_aucune_"}

## Encore bloquées (\`${REASON}\`)

${blocked.map((b) => `- **${b.name}** (\`${b.slug}\`) — ${b.detail}`).join("\n") || "_aucune_"}

## Notes

${extras.map((e) => `- ${e}`).join("\n")}

## Vérifications

- Aucune image de gamme utilisée comme packshot produit
- Aucun mélange fabricant
- Aucun SumUp inventé
- Gate non forcée
`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, md);
}

async function main() {
  const ll = await processMfr("liquide-lab");
  writeReport(
    path.resolve("catalogues/rapports/RAPPORT_LIQUID_LAB_REPRISE.md"),
    "RAPPORT Liquide Lab — Reprise",
    ll,
    [
      "Site officiel : https://liquidelab.com/",
      "Locaux Kuix présents mais hors périmètre des 15 bloqués (Iceberg/GlaGla/Péché)",
      "Visuels /img/gamme/Iceberg.jpg|Glagla.jpg|peche-gourmands.jpg exclus",
    ],
  );

  const am = await processMfr("airmust");
  writeReport(
    path.resolve("catalogues/rapports/RAPPORT_AIRMUST_REPRISE.md"),
    "RAPPORT AirMust — Reprise",
    am,
    [
      "Site officiel : https://airmust.com/",
      "Les 21 bloqués SumUp+photo portent des noms Liquide Lab — incohérence catalogue",
      "Vrais produits AirMust (Ferox/Press Start/Hopper/UNIK) existent surtout sans SumUp → hors de cette file photo+SumUp",
    ],
  );

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        liquideLab: {
          controlled: ll.length,
          completed: ll.filter((r) => r.decision === "completed").length,
          blocked: ll.filter((r) => r.decision === "blocked").length,
          published: ll.filter((r) => r.published).length,
        },
        airmust: {
          controlled: am.length,
          completed: am.filter((r) => r.decision === "completed").length,
          blocked: am.filter((r) => r.decision === "blocked").length,
          published: am.filter((r) => r.published).length,
        },
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
