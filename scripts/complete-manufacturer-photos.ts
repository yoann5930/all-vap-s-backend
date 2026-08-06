/**
 * Étape générique — complétion photos fabricant (MDS, Cookin Cloud, Alfa, Juice66, Raneki, Cloud Vapor, Liquidarom).
 * Usage: npx tsx scripts/complete-manufacturer-photos.ts <slug> [--apply]
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
const SLUG = process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) || "";
const UA = "AllVapsCatalogBot/1.0 (+mfr-completion)";

type SourceCfg = {
  base: string;
  reportFile: string;
  title: string;
  search?: (q: string) => string;
  extract?: (html: string, base: string) => Array<{ url: string; label: string }>;
  /** Si true : ne jamais publier même avec match (site mort / preuve insuffisante) */
  forceOfflineReason?: string;
  /** Tokens / patterns de gamme étrangère → blocage */
  foreignRange?: RegExp;
  minScore?: number;
  extraNotes?: string[];
};

const CFGS: Record<string, SourceCfg> = {
  "mds-juice": {
    base: "https://www.mdsjuice.com",
    reportFile: "RAPPORT_MDS_JUICE_COMPLETION.md",
    title: "MDS Juice",
    search: (q) => `https://www.mdsjuice.com/recherche?controller=search&s=${encodeURIComponent(q)}`,
    extraNotes: [
      "Ne pas mélanger contenances ; packshot unique par saveur.",
      "Si DNS / site mort : laisser hors ligne (aucune image inventée).",
    ],
  },
  "cookin-cloud": {
    base: "https://www.cookincloud.com",
    reportFile: "RAPPORT_COOKIN_CLOUD_COMPLETION.md",
    title: "Cookin Cloud",
    search: (q) =>
      `https://www.cookincloud.com/recherche?controller=search&s=${encodeURIComponent(q)}`,
    extraNotes: ["Gamme Myst — associer uniquement le bon personnage."],
  },
  alfa: {
    base: "https://www.alfa.fr",
    reportFile: "RAPPORT_ALFA_COMPLETION.md",
    title: "Alfa",
    search: (q) => `https://www.alfa.fr/recherche?controller=search&s=${encodeURIComponent(q)}`,
    foreignRange: /\b(iceberg|gla\s*gla|glagla|p[eé]ch[eé]\s*gourmand)\b/i,
    extraNotes: [
      "Si le nom porte Iceberg/GlaGla/Péché Gourmand → incohérence fabricant (Liquide Lab), laisser hors ligne.",
    ],
  },
  "juice-66": {
    base: "https://www.juice66.fr",
    reportFile: "RAPPORT_JUICE_66_COMPLETION.md",
    title: "Juice 66",
    search: (q) => `https://www.juice66.fr/recherche?controller=search&s=${encodeURIComponent(q)}`,
    extraNotes: [
      "Site souvent indisponible (DNS mort) — caches locaux uniquement si preuve officielle déjà validée.",
      "Ne pas utiliser vapair.pro / revendeur sans preuve fabricant.",
    ],
  },
  "raneki-liquide": {
    base: "https://www.ranekiliquide.fr",
    reportFile: "RAPPORT_RANEKI_COMPLETION.md",
    title: "Raneki Liquide",
    search: (q) =>
      `https://www.ranekiliquide.fr/recherche?controller=search&s=${encodeURIComponent(q)}`,
    extraNotes: ["Aphrodite ≠ Hadès — personnages Olympe distincts."],
  },
  "cloud-vapor": {
    base: "https://cloudvapor.com",
    reportFile: "RAPPORT_CLOUD_VAPOR_COMPLETION.md",
    title: "Cloud Vapor",
    search: (q) =>
      `https://cloudvapor.com/recherche?controller=search&s=${encodeURIComponent(q)}`,
    extraNotes: ["Call of Vape — Zombie uniquement. Vérifier format 50 ml vs 100 ml."],
  },
  liquidarom: {
    base: "https://www.liquidarom.com",
    reportFile: "RAPPORT_LIQUIDAROM_COMPLETION.md",
    title: "Liquidarom",
    search: (q) =>
      `https://www.liquidarom.com/recherche?controller=search&s=${encodeURIComponent(q)}`,
    extraNotes: ["Pastis 13 / Les Essentiels — pas de photo rayon, pas d’autre Essentiel."],
  },
};

function norm(s: string) {
  return normalizeCatalogKey(s);
}

function defaultExtract(html: string, base: string): Array<{ url: string; label: string }> {
  const out: Array<{ url: string; label: string }> = [];
  const cleaned = html.replace(/\\\//g, "/");
  const host = base.replace(/\/$/, "");
  for (const m of cleaned.matchAll(
    /(?:https?:\/\/[^"'\\\s]+)?\/(\d+)-(?:home_default_2x|large_default|home_default)\/([a-z0-9-]+)\.(jpe?g|png|webp)/gi,
  )) {
    if (/fr-default|logo|banner|stores/i.test(m[0])) continue;
    const url = m[0].startsWith("http")
      ? m[0].replace(/home_default(?!_2x)/, "home_default_2x")
      : `${host}/${m[1]}-home_default_2x/${m[2]}.${m[3]}`;
    out.push({ url, label: m[2] });
  }
  for (const m of cleaned.matchAll(
    /(?:src|data-image-large-src|data-src)="([^"]+(?:large_default|home_default)[^"]*\.(?:jpe?g|png|webp))"/gi,
  )) {
    let u = m[1];
    if (u.startsWith("//")) u = `https:${u}`;
    else if (u.startsWith("/")) u = `${host}${u}`;
    out.push({
      url: u.replace(/home_default(?!_2x)/, "home_default_2x"),
      label: path.basename(u).replace(/\.(jpe?g|png|webp)$/i, ""),
    });
  }
  return out;
}

function flavorTokens(name: string, mfrSlug: string): string[] {
  let q = name;
  q = q.replace(
    /\b(liquidarom|raneki\s*liquide|cookin\s*cloud|the\s*mds\s*juice|mds\s*juice|cloud\s*vapor|juice\s*66|airmust|alfa|liquide\s*lab|olympe|les\s*essentiels|call\s*of\s*vape|myst|icebreak)\b/gi,
    " ",
  );
  q = q.replace(/\b\d+\s*ml\b/gi, " ").replace(/\b\d+\s*mg\b/gi, " ");
  return norm(q)
    .split(/\s+/)
    .filter((t) => t.length > 2 && !/^(omg|ml|mg)$/.test(t));
}

function scoreLabel(
  label: string,
  productName: string,
  mfrSlug: string,
  cfg: SourceCfg,
  volumeMl?: number | null,
): number {
  const fn = norm(label.replace(/[-_]+/g, " "));
  if (cfg.foreignRange && cfg.foreignRange.test(productName)) return 0;
  if (/logo|banner|gamme|collection|pack|groupe|lineup|rayon|shelf/i.test(fn)) return 0;

  // Format / contenance : ne jamais associer 10ml ↔ 50ml ↔ 100ml
  const want50 =
    volumeMl === 50 || /\b50\s*ml\b/i.test(productName) || /[-_]50ml/i.test(productName);
  const want10 = volumeMl === 10 || /\b10\s*ml\b/i.test(productName);
  const want100 = volumeMl === 100 || /\b100\s*ml\b/i.test(productName);
  const label10 = /\b10\s*ml\b|[-_]10ml\b/i.test(label);
  const label50 = /\b50\s*ml\b|[-_]50ml\b/i.test(label);
  const label100 = /\b100\s*ml\b|[-_]100ml\b/i.test(label);
  if (want50 && (label10 || label100) && !label50) return 0;
  if (want10 && (label50 || label100) && !label10) return 0;
  if (want100 && (label10 || label50) && !label100) return 0;
  let formatBoost = 0;
  if (want50 && label50) formatBoost = 5;
  if (want10 && label10) formatBoost = 5;
  if (want100 && label100) formatBoost = 5;

  // Raneki: Aphrodite vs Hades
  if (/aphrodite/i.test(productName) && /hades|had[eè]s/i.test(fn)) return 0;
  if (/had[eè]s|hades/i.test(productName) && /aphrodite/i.test(fn)) return 0;

  // Liquidarom Pastis 13 — exiger pastis + 13, et bon format
  if (/pastis/i.test(productName)) {
    if (!/pastis/.test(fn)) return 0;
    if (!/\b13\b/.test(fn) && !/pastis\s*13/.test(fn)) return 0;
  }

  // Cloud Vapor Zombie
  if (/zombie/i.test(productName) && !/zombie/.test(fn)) return 0;

  // Myst characters
  if (/myst/i.test(productName) || mfrSlug === "cookin-cloud") {
    const char = productName.match(
      /\bda\s+(loving\s+witch|crazy\s+bird|smoky\s+eye|crusty\s+king|good\s+snake|sweet(?:y)?\s+face)\b/i,
    );
    if (char) {
      const key = norm(char[1]).replace(/\s+/g, "");
      const compact = fn.replace(/\s+/g, "");
      if (!compact.includes(key) && !compact.includes(key.replace("sweety", "sweet"))) return 0;
    }
  }

  // MDS Juice flavor names
  if (mfrSlug === "mds-juice") {
    const flavors = [
      "mojito",
      "gold",
      "sunny",
      "delicious",
      "lime",
      "green",
      "red wedding",
      "virgo",
      "pink",
      "dark rainbow",
      "beast",
      "black summer",
      "blue",
    ];
    const hit = flavors.find((f) => norm(productName).includes(norm(f)));
    if (hit && !fn.includes(norm(hit).replace(/\s+/g, " ")) && !fn.replace(/\s+/g, "").includes(norm(hit).replace(/\s+/g, ""))) {
      // try compact
      const compact = fn.replace(/\s+/g, "");
      const want = norm(hit).replace(/\s+/g, "");
      if (!compact.includes(want)) return 0;
    }
  }

  // Juice 66 Frost vs Snow
  if (/frost/i.test(productName) && /snow/i.test(fn) && !/frost/i.test(fn)) return 0;
  if (/snow/i.test(productName) && /frost/i.test(fn) && !/snow/i.test(fn)) return 0;

  const tokens = flavorTokens(productName, mfrSlug);
  if (!tokens.length) return 0;
  let hits = 0;
  for (const t of tokens) if (fn.includes(t) || fn.replace(/\s+/g, "").includes(t)) hits += 1;
  const ratio = hits / tokens.length;
  if (ratio < 0.85) return 0;
  return Math.round(ratio * 20) + formatBoost;
}

async function download(url: string, dest: string, referer: string): Promise<boolean> {
  const candidates = [
    url,
    url.replace("home_default_2x", "large_default"),
    url.replace("home_default_2x", "home_default"),
  ];
  for (const u of [...new Set(candidates)]) {
    try {
      const res = await fetch(u, {
        headers: { "User-Agent": UA, Accept: "image/*", Referer: referer },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2500) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await sharp(buf)
        .rotate()
        .resize(1000, 1000, { fit: "inside", background: { r: 11, g: 16, b: 22 } })
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

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(webp|jpe?g|png)$/i.test(ent.name) && !/-thumb/i.test(ent.name)) out.push(full);
  }
  return out;
}

async function probeSite(base: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(base, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    return { ok: res.ok, detail: `HTTP ${res.status} → ${res.url}` };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

async function main() {
  if (!SLUG || !CFGS[SLUG]) {
    console.error("Usage: npx tsx scripts/complete-manufacturer-photos.ts <slug> [--apply]");
    console.error("slugs:", Object.keys(CFGS).join(", "));
    process.exit(1);
  }
  const cfg = CFGS[SLUG];
  const OUT_MD = path.resolve("catalogues/rapports", cfg.reportFile);
  const minScore = cfg.minScore ?? 12;

  const mfr = await prisma.manufacturer.findFirst({ where: { slug: SLUG } });
  if (!mfr) throw new Error(`${SLUG} manufacturer missing`);

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

  const site = await probeSite(cfg.base);
  const mediaRoot = path.join(process.cwd(), "public", "media", "products", SLUG);
  const locals = walk(mediaRoot);
  // also alt folders
  const altRoots = [
    path.join(process.cwd(), "public", "images", "products", SLUG),
    path.join(process.cwd(), "public", "media", "products", SLUG.replace(/-/g, "")),
  ];
  for (const a of altRoots) walk(a, locals);

  const completed: Array<Record<string, unknown>> = [];
  const stillBlocked: Array<Record<string, unknown>> = [];
  const usedRemote = new Set<string>();
  const usedLocal = new Set<string>();

  for (const p of blocked) {
    if (cfg.foreignRange && cfg.foreignRange.test(p.name)) {
      stillBlocked.push({
        slug: p.slug,
        name: p.name,
        reason: "fabricant_catalogue_incoherent",
        detail: "Gamme Liquide Lab détectée sur fiche Alfa — aucune image appliquée",
      });
      continue;
    }

    if (cfg.forceOfflineReason) {
      stillBlocked.push({
        slug: p.slug,
        name: p.name,
        reason: cfg.forceOfflineReason,
      });
      continue;
    }

    // Local first
    let chosen: { kind: "local" | "remote"; pathOrUrl: string; label: string; score: number } | null =
      null;

    for (const file of locals) {
      if (usedLocal.has(file)) continue;
      const score = scoreLabel(path.basename(file), p.name, SLUG, cfg, p.volumeMl);
      if (score < minScore) continue;
      if (!chosen || score > chosen.score)
        chosen = { kind: "local", pathOrUrl: file, label: path.basename(file), score };
    }

    if (!chosen && site.ok && cfg.search) {
      const volHint =
        p.volumeMl === 50 || /\b50\s*ml\b/i.test(p.name)
          ? "50ml"
          : p.volumeMl === 10 || /\b10\s*ml\b/i.test(p.name)
            ? "10ml"
            : p.volumeMl === 100 || /\b100\s*ml\b/i.test(p.name)
              ? "100ml"
              : "";
      const qBase = flavorTokens(p.name, SLUG).join(" ").slice(0, 60) || p.name.slice(0, 60);
      const queries = [
        volHint ? `${qBase} ${volHint}` : qBase,
        p.name.replace(/\b\d+\s*ml\b/gi, "").trim().slice(0, 70),
        qBase,
      ].filter((q, i, a) => q.length >= 3 && a.indexOf(q) === i);

      for (const query of queries) {
        try {
          const res = await fetch(cfg.search(query), {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(25000),
          });
          if (!res.ok) continue;
          const html = await res.text();
          const imgs = (cfg.extract || defaultExtract)(html, cfg.base);
          for (const img of imgs) {
            if (usedRemote.has(img.url)) continue;
            const score = scoreLabel(img.label, p.name, SLUG, cfg, p.volumeMl);
            if (score < minScore) continue;
            if (!chosen || score > chosen.score)
              chosen = { kind: "remote", pathOrUrl: img.url, label: img.label, score };
          }
        } catch {
          /* next query */
        }
      }
    }

    if (!chosen) {
      stillBlocked.push({
        slug: p.slug,
        name: p.name,
        range: p.rangeRef?.slug,
        reason: site.ok ? "aucune_image_officielle_certaine" : "source_officielle_non_accessible",
        detail: site.detail,
      });
      continue;
    }

    const destRel = `media/products/${SLUG}/${p.rangeRef?.slug || "_unassigned"}/${p.slug}.webp`;
    const destAbs = path.join(process.cwd(), "public", destRel);
    const publicUrl = `/${destRel}`;
    let ok = false;
    let sourceUrl = chosen.pathOrUrl;

    if (chosen.kind === "local") {
      const rel = chosen.pathOrUrl.replace(/\\/g, "/").split("/public/")[1];
      if (rel) {
        const useUrl = `/${rel}`;
        if (APPLY) {
          await prisma.product.update({
            where: { id: p.id },
            data: { imageUrl: useUrl, imageStatus: "official", images: [useUrl] },
          });
        }
        usedLocal.add(chosen.pathOrUrl);
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
        continue;
      }
      if (APPLY) {
        fs.mkdirSync(path.dirname(destAbs), { recursive: true });
        await sharp(chosen.pathOrUrl)
          .rotate()
          .resize(1000, 1000, { fit: "inside", background: { r: 11, g: 16, b: 22 } })
          .flatten({ background: { r: 11, g: 16, b: 22 } })
          .webp({ quality: 90 })
          .toFile(destAbs);
        ok = fs.existsSync(destAbs);
        usedLocal.add(chosen.pathOrUrl);
      } else ok = true;
      sourceUrl = `local:${chosen.label}`;
    } else {
      if (APPLY) {
        ok = await download(chosen.pathOrUrl, destAbs, cfg.base);
        if (ok) usedRemote.add(chosen.pathOrUrl);
      } else ok = true;
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
        data: { imageUrl: publicUrl, imageStatus: "official", images: [publicUrl] },
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
    }

    completed.push({
      slug: p.slug,
      name: p.name,
      label: chosen.label,
      source: sourceUrl,
      score: chosen.score,
      published: APPLY ? published : gate.canPublishOnline,
    });
  }

  const md = `# RAPPORT ${cfg.title} — Complétion

**Date :** ${new Date().toISOString()}  
**Mode :** ${APPLY ? "APPLY" : "DRY-RUN"}  
**Fabricant slug :** \`${SLUG}\`

## Synthèse

| Indicateur | Valeur |
|---|---:|
| Références contrôlées | ${blocked.length} |
| Complétées | ${completed.length} |
| Encore bloquées | ${stillBlocked.length} |
| Publiées / publiables | ${completed.filter((c) => c.published).length} |
| Site officiel | ${site.ok ? "accessible" : "non accessible"} (${site.detail}) |

## Notes

${(cfg.extraNotes || []).map((n) => `- ${n}`).join("\n") || "-"}

## Références contrôlées

${blocked.map((p) => `- ${p.name} (\`${p.slug}\`) · gamme ${p.rangeRef?.slug || "—"}`).join("\n")}

## Complétées

${completed.map((c) => `- **${c.name}** ← \`${c.label}\` · ${c.source} · publié=${c.published}`).join("\n") || "_aucune_"}

## Encore bloquées

${stillBlocked.map((b) => `- **${b.name}** — \`${b.reason}\`${b.detail ? ` — ${b.detail}` : ""}`).join("\n") || "_aucune_"}

## Vérifications

- Correspondances une par une ; score min ${minScore}
- Aucun SumUp inventé
- Gate \`evaluateEliquidePublishGate\` respectée
- Aucune image générique / rayon / groupe
`;

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_MD, md);
  console.log(
    JSON.stringify(
      {
        slug: SLUG,
        apply: APPLY,
        controlled: blocked.length,
        completed: completed.length,
        stillBlocked: stillBlocked.length,
        site,
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
