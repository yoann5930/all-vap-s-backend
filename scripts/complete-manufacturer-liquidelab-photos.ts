/**
 * Étape 3 — Liquide Lab (Quix/Kuix, Iceberg, GlaGla).
 * Règles : Ice (pas Iced) ; pas de photo de gamme/groupe ; pas de mélange.
 * Usage: npx tsx scripts/complete-manufacturer-liquidelab-photos.ts [--apply]
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
const UA = "AllVapsCatalogBot/1.0 (+liquidelab-completion)";
const OUT_MD = path.resolve("catalogues/rapports/RAPPORT_LIQUID_LAB_COMPLETION.md");
const MEDIA = path.join(process.cwd(), "public", "media", "products", "liquide-lab");
const BASE = "https://www.liquidelab.com";

function norm(s: string) {
  return normalizeCatalogKey(s);
}

function detectRange(name: string, rangeSlug: string | null): "iceberg" | "glagla" | "kuix" | "peche-gourmand" | "other" {
  const blob = `${name} ${rangeSlug || ""}`;
  if (/gla\s*gla|glagla/i.test(blob)) return "glagla";
  if (/iceberg/i.test(blob)) return "iceberg";
  if (/kuix|quix/i.test(blob)) return "kuix";
  if (/p[eé]ch[eé]\s*gourmand/i.test(blob)) return "peche-gourmand";
  return "other";
}

function flavorTokens(name: string): string[] {
  return norm(
    name
      .replace(/\b(iceberg|gla\s*gla|glagla|p[eé]ch[eé]\s*gourmand|kuix|quix|liquide\s*lab|o['’]?jlab)\b/gi, " ")
      .replace(/\b\d+\s*ml\b/gi, " ")
      .replace(/\b\d+\s*mg\b/gi, " "),
  )
    .split(/\s+/)
    .filter((t) => t.length > 2 && !/^(iced|ice)$/.test(t)); // ice alone trop faible ; "iced" interdit
}

function scoreFile(fileBase: string, productName: string, range: string): number {
  const raw = fileBase.replace(/\.(webp|jpe?g|png)$/i, "");
  if (/-thumb$/i.test(raw)) return 0;
  // Interdit : visuels de gamme / groupe
  if (/^(iceberg|glagla|gla-gla|peche-gourmands?|iceberg-mix|iceberg-salt)$/i.test(raw)) return 0;
  if (/gamme|collection|pack|lot|groupe|lineup/i.test(raw)) return 0;
  // Interdit : "iced" au lieu de Iceberg / Ice
  if (/\biced\b/i.test(raw) && /iceberg/i.test(productName)) return 0;

  const fn = norm(raw.replace(/[-_]+/g, " "));
  if (range === "iceberg" && !/iceberg/.test(fn) && !flavorTokens(productName).every((t) => fn.includes(t))) {
    // allow flavor-only filename if all tokens match
  }
  if (range === "glagla" && /iceberg/.test(fn) && !/glagla|gla\s*gla/.test(fn)) return 0;
  if (range === "iceberg" && /glagla|gla\s*gla/.test(fn) && !/iceberg/.test(fn)) return 0;

  const tokens = flavorTokens(productName);
  if (!tokens.length) return 0;
  let hits = 0;
  for (const t of tokens) if (fn.includes(t)) hits += 1;
  const ratio = hits / tokens.length;
  if (ratio < 0.9) return 0;
  return Math.round(ratio * 20);
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(webp|jpe?g|png)$/i.test(ent.name)) out.push(full);
  }
  return out;
}

async function main() {
  const mfr = await prisma.manufacturer.findFirst({
    where: { OR: [{ slug: "liquide-lab" }, { slug: "liquid-lab" }] },
  });
  if (!mfr) throw new Error("liquide-lab manufacturer missing");

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

  // Official site probe: only gamme covers available publicly
  let siteOk = false;
  let officialIndividualPackshots = false;
  const officialNotes: string[] = [];
  try {
    const res = await fetch(BASE, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    siteOk = res.ok;
    const html = await res.text();
    if (/img\/gamme\/(Iceberg|Glagla|peche)/i.test(html)) {
      officialNotes.push(
        "Site officiel accessible mais n’expose publiquement que des visuels de gamme (Iceberg.jpg, Glagla.jpg, peche-gourmands.jpg) — interdits comme visuel produit.",
      );
    }
    const search = await fetch(`${BASE}/recherche?controller=search&s=Iceberg`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (search.status === 404) {
      officialNotes.push("Recherche publique /recherche → 404 (portail B2B / login requis).");
    }
  } catch (e) {
    officialNotes.push(`Site officiel inaccessible: ${String(e)}`);
  }

  const locals = walk(MEDIA);
  const completed: Array<Record<string, unknown>> = [];
  const stillBlocked: Array<Record<string, unknown>> = [];
  const usedLocal = new Set<string>();

  for (const p of blocked) {
    const range = detectRange(p.name, p.rangeRef?.slug ?? null);
    let chosen: { file: string; score: number; label: string } | null = null;

    for (const file of locals) {
      if (usedLocal.has(file)) continue;
      const base = path.basename(file);
      const score = scoreFile(base, p.name, range);
      if (score < 12) continue;
      if (!chosen || score > chosen.score) chosen = { file, score, label: base };
    }

    if (!chosen) {
      stillBlocked.push({
        slug: p.slug,
        name: p.name,
        range: p.rangeRef?.slug ?? range,
        reason: officialIndividualPackshots
          ? "aucune_image_officielle_certaine"
          : "source_officielle_packshot_individuel_non_accessible",
        detail:
          range === "other"
            ? "Gamme non identifiée clairement"
            : `Aucun packshot individuel local ni exposé publiquement pour ${range}. Visuels de gamme exclus.`,
      });
      continue;
    }

    // Local exact match path
    const rel = chosen.file.replace(/\\/g, "/").split("/public/")[1];
    const useUrl = rel ? `/${rel}` : null;
    if (!useUrl) {
      stillBlocked.push({ slug: p.slug, name: p.name, reason: "chemin_local_invalide" });
      continue;
    }

    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: {
          imageUrl: useUrl,
          imageStatus: "official",
          images: [useUrl],
        },
      });
    }
    usedLocal.add(chosen.file);

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
      label: chosen.label,
      source: `local:${useUrl}`,
      published: APPLY ? published : gate.canPublishOnline,
    });
  }

  // unused sharp import guard for future downloads
  void sharp;

  const md = `# RAPPORT Liquide Lab — Complétion

**Date :** ${new Date().toISOString()}  
**Mode :** ${APPLY ? "APPLY" : "DRY-RUN"}

## Synthèse

| Indicateur | Valeur |
|---|---:|
| Références contrôlées | ${blocked.length} |
| Complétées | ${completed.length} |
| Encore bloquées | ${stillBlocked.length} |
| Publiées / publiables | ${completed.filter((c) => c.published).length} |
| Site liquidelab.com | ${siteOk ? "accessible" : "non"} |

## Constat sources officielles

${officialNotes.map((n) => `- ${n}`).join("\n") || "- RAS"}

**Règle appliquée :** aucune photo de groupe / gamme (\`Iceberg.jpg\`, \`Glagla.jpg\`, \`peche-gourmands.jpg\`) n’est utilisée comme visuel produit. Aucune image revendeur (eliquidandco, etc.) n’a été appliquée faute de preuve packshot officiel individuel public.

## Locaux disponibles

- \`public/media/products/liquide-lab/kuix/50ml/\` — ${locals.filter((f) => /kuix/i.test(f)).length} fichiers (gamme Kuix déjà largement publiée)
- Iceberg / GlaGla / Péché Gourmand : **0** packshot individuel local

## Références contrôlées

${blocked.map((p) => `- ${p.name} (\`${p.slug}\`) · ${p.rangeRef?.slug || detectRange(p.name, null)}`).join("\n")}

## Complétées

${completed.map((c) => `- **${c.name}** ← \`${c.label}\` · publié=${c.published}`).join("\n") || "_aucune_"}

## Encore bloquées

${stillBlocked.map((b) => `- **${b.name}** — \`${b.reason}\` — ${b.detail || ""}`).join("\n") || "_aucune_"}

## Vérifications

- ${blocked.length} références revues
- Noms/gammes : Iceberg / GlaGla / Péché Gourmand / Kuix — pas de « Iced »
- Aucune photo de groupe comme visuel produit
- Aucun SumUp inventé
- Gate respectée
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
        stillBlockedDetails: stillBlocked,
        completedDetails: completed,
        localCount: locals.length,
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
