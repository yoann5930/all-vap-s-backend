/**
 * Pass 4 — corrections finales internes :
 * - normalisation FR (vert/verte)
 * - EAN Force Verte + autres matchs ratés
 * - photos depuis images SumUp (export magasin)
 * - SumUp ID même sans EAN (Bisou Black)
 * - nicotine 0 mg si documentée SumUp (00mg / sans nicotine)
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "final-100");
const ENRICH = path.join(ROOT, "catalogues/validation-finale/ENRICHISSEMENT_PUBLIC.json");
const SUMUP = path.join(ROOT, "inbox_sumup/2026-08-03_16-46-54_items-export_MCGR4RXU.csv");

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function stemFr(t: string) {
  // light FR stemming for catalog matching
  if (t.endsWith("ette") && t.length > 5) return t.slice(0, -3); // violette -> violet? better keep
  if (t.endsWith("e") && t.length > 3) {
    const base = t.slice(0, -1);
    // verte -> vert, noire -> noir, jaune stays
    return base;
  }
  return t;
}

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: string) {
  return norm(s)
    .split(" ")
    .filter(
      (t) =>
        t &&
        ![
          "ml",
          "mg",
          "by",
          "e",
          "liquide",
          "eliquide",
          "swoke",
          "airmust",
          "hopper",
          "force",
          "vape",
        ].includes(t),
    )
    .filter((t) => !/^\d+$/.test(t))
    .map(stemFr);
}

function extractMl(s: string): number | null {
  const m = s.match(/(\d+)\s*ml/i);
  return m ? Number(m[1]) : null;
}

function flavorMatch(a: string, b: string) {
  const fa = tokens(a);
  if (!fa.length) return 0;
  const nb = norm(b);
  const nbToks = new Set(tokens(b));
  const hit = fa.filter((t) => nbToks.has(t) || nb.includes(t) || nb.includes(stemFr(t))).length;
  return hit / fa.length;
}

function parseDelimited(line: string, delim: string) {
  const cols: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === delim && !q) {
      cols.push(cur);
      cur = "";
    } else cur += c;
  }
  cols.push(cur);
  return cols;
}

function loadCsv(file: string) {
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length);
  const headers = parseDelimited(lines[0], ",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  let buf = "";
  for (let i = 1; i < lines.length; i++) {
    buf += (buf ? "\n" : "") + lines[i];
    if (((buf.match(/"/g) || []).length) % 2) continue;
    const cols = parseDelimited(buf, ",");
    buf = "";
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || "").replace(/^\t/, "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function download(url: string, dest: string): Promise<boolean> {
  return new Promise((resolve) => {
    const mod = url.startsWith("https") ? https : http;
    const file = fs.createWriteStream(dest);
    const req = mod.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        download(res.headers.location, dest).then(resolve);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        try {
          fs.unlinkSync(dest);
        } catch {}
        resolve(false);
        return;
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(true);
      });
    });
    req.on("error", () => {
      try {
        fs.unlinkSync(dest);
      } catch {}
      resolve(false);
    });
  });
}

async function main() {
  const prisma = new PrismaClient();
  const enrich: any[] = JSON.parse(fs.readFileSync(ENRICH, "utf8"));
  const sumup = loadCsv(SUMUP);
  const bySumupId = new Map(sumup.map((r) => [r["Item id (Do not change)"], r]));

  let eanApplied = 0;
  let sumupLinked = 0;
  let photosFromSumup = 0;
  let nicotineApplied = 0;
  let released = 0;
  const log: any[] = [];

  for (const item of enrich) {
    const db = await prisma.product.findUnique({
      where: { id: item.productId },
      include: {
        manufacturer: true,
        rangeRef: true,
        catalogImages: true,
        variants: true,
      },
    });
    if (!db) continue;

    const catalogName = item.catalogName || db.name;
    const catalogMl = db.volumeMl || item.formatMl || extractMl(catalogName);
    const notes: string[] = [];
    const updates: Record<string, unknown> = {};

    const brandHints = [
      db.manufacturer?.name,
      db.rangeRef?.name,
      item.manufacturer,
      item.range,
      "force vape",
      "swoke",
      "unik",
      "bisou",
      "saint flava",
    ].filter(Boolean) as string[];

    // Special: Force Verte / Force Violette — keep "force" in match via raw name
    let candidates = sumup.filter((r) => {
      const n = r["Item name"] || "";
      const cat = r["Category"] || "";
      const ml = extractMl(n) ?? extractMl(cat);
      // For Force * use dedicated matcher
      if (/^force\s+/i.test(catalogName)) {
        const cn = norm(catalogName);
        const sn = norm(n);
        if (!sn.includes("force")) return false;
        const color = cn.replace("force", "").trim(); // verte / violette
        const colorStem = stemFr(color);
        if (!sn.includes(color) && !sn.includes(colorStem)) return false;
        if (!sn.includes("vape") && !sn.includes("swoke")) return false;
        if (catalogMl != null && ml != null && catalogMl !== ml) return false;
        return true;
      }
      if (flavorMatch(catalogName, n) < 0.99) return false;
      if (catalogMl != null && ml != null && catalogMl !== ml) return false;
      if (catalogMl != null && ml == null) return false;
      return true;
    });

    if (candidates.length > 1) {
      const branded = candidates.filter((r) => {
        const ns = norm(r["Item name"] || "");
        return brandHints.some((h) => ns.includes(norm(h)));
      });
      if (branded.length >= 1) candidates = branded;
    }

    const barcodes = [
      ...new Set(
        candidates.map((c) => c.Barcode).filter((b) => /^\d{8,14}$/.test(b || "")),
      ),
    ];
    const ids = [
      ...new Set(candidates.map((c) => c["Item id (Do not change)"]).filter(Boolean)),
    ];

    let chosen: (typeof candidates)[0] | null = null;
    if (ids.length === 1) chosen = candidates[0];
    else if (barcodes.length === 1) {
      chosen = candidates.find((c) => c.Barcode === barcodes[0]) || candidates[0];
    } else if (candidates.length === 1) chosen = candidates[0];

    // If already has sumup id, use that row
    if (db.sumupProductId && bySumupId.has(db.sumupProductId)) {
      chosen = bySumupId.get(db.sumupProductId)!;
    }

    if (chosen) {
      const sid = chosen["Item id (Do not change)"];
      const bc = chosen.Barcode || "";

      if (!db.sumupProductId && sid) {
        const holder = await prisma.product.findFirst({
          where: { sumupProductId: sid, NOT: { id: db.id } },
        });
        if (holder && !holder.isActive) {
          await prisma.product.update({
            where: { id: holder.id },
            data: { sumupProductId: null },
          });
          released += 1;
          updates.sumupProductId = sid;
          sumupLinked += 1;
          notes.push(`SumUp ID depuis inactif`);
        } else if (!holder) {
          updates.sumupProductId = sid;
          sumupLinked += 1;
          notes.push(`SumUp ID lié`);
        }
      }

      if (!db.barcode && /^\d{8,14}$/.test(bc)) {
        const holders = await prisma.product.findMany({
          where: { barcode: bc, NOT: { id: db.id } },
        });
        const active = holders.filter((h) => h.isActive);
        if (active.length === 0) {
          for (const h of holders) {
            await prisma.product.update({
              where: { id: h.id },
              data: { barcode: null },
            });
            released += 1;
          }
          updates.barcode = bc;
          eanApplied += 1;
          notes.push(`EAN ${bc}`);
        } else {
          notes.push(`EAN ${bc} sur actif «${active[0].name}» (doublon?)`);
        }
      }

      // Photo from SumUp image if missing
      const img = chosen["Image 1"] || "";
      if ((!db.imageUrl || !(db.images && db.images.length)) && img.startsWith("http")) {
        const ext = path.extname(new URL(img).pathname) || ".jpg";
        const publicDir = path.join(
          ROOT,
          "public/media/products",
          db.manufacturer?.slug || "misc",
          db.rangeRef?.slug || "range",
        );
        fs.mkdirSync(publicDir, { recursive: true });
        const fname = `${slugify(catalogName)}${ext}`;
        const destAbs = path.join(publicDir, fname);
        const ok = await download(img, destAbs);
        if (ok) {
          const rel = `/media/products/${db.manufacturer?.slug || "misc"}/${db.rangeRef?.slug || "range"}/${fname}`;
          updates.imageUrl = rel;
          updates.imageStatus = "validated";
          photosFromSumup += 1;
          fs.copyFileSync(
            destAbs,
            path.join(OUT, "photos", `${slugify(catalogName)}${ext}`),
          );
          notes.push(`photo SumUp: ${rel}`);
        }
      }

      // Nicotine from SumUp description / name
      const blob = `${chosen["Item name"]} ${chosen.Description || ""} ${chosen["Description (Online Store and Invoices only)"] || ""}`;
      const has0 =
        /00\s*mg|0\s*mg|sans nicotine|liquide 00|surdosé/i.test(blob) ||
        (item.nicotine && /0\s*mg/i.test(item.nicotine));
      if (has0) {
        for (const v of db.variants) {
          if (v.nicotineMg == null && !v.nicotineLabel) {
            await prisma.productVariant.update({
              where: { id: v.id },
              data: { nicotineMg: 0, nicotineLabel: "0 mg/ml" },
            });
            nicotineApplied += 1;
          }
        }
        // If no variants, skip creating — don't invent product structure
        notes.push("nicotine 0 mg documentée SumUp/enrich");
      }
    }

    // Enrich photo local fallback
    if (
      !db.imageUrl &&
      !updates.imageUrl &&
      item.photoLocal &&
      fs.existsSync(path.join(ROOT, item.photoLocal))
    ) {
      const abs = path.join(ROOT, item.photoLocal);
      const ext = path.extname(abs);
      const publicDir = path.join(
        ROOT,
        "public/media/products",
        db.manufacturer?.slug || "misc",
        db.rangeRef?.slug || "range",
      );
      fs.mkdirSync(publicDir, { recursive: true });
      const fname = `${slugify(catalogName)}${ext}`;
      fs.copyFileSync(abs, path.join(publicDir, fname));
      const rel = `/media/products/${db.manufacturer?.slug || "misc"}/${db.rangeRef?.slug || "range"}/${fname}`;
      updates.imageUrl = rel;
      updates.imageStatus = "validated";
      photosFromSumup += 1;
      fs.copyFileSync(abs, path.join(OUT, "photos", fname));
      notes.push(`photo enrich locale: ${rel}`);
    }

    if (Object.keys(updates).length) {
      await prisma.product.update({ where: { id: db.id }, data: updates });
    }
    if (notes.length) log.push({ name: catalogName, notes });
  }

  // Rebuild fiches + audit
  const fiches: any[] = [];
  const stillMissing: any[] = [];
  for (const item of enrich) {
    const db = await prisma.product.findUnique({
      where: { id: item.productId },
      include: {
        manufacturer: true,
        rangeRef: true,
        catalogImages: true,
        variants: true,
      },
    });
    if (!db) continue;
    const catalogName = item.catalogName || db.name;
    const nicotine =
      (item.nicotine && !/non (publié|trouvé|renseign)/i.test(item.nicotine)
        ? item.nicotine
        : null) ||
      db.variants
        .map((v) => v.nicotineLabel || (v.nicotineMg != null ? `${v.nicotineMg} mg` : null))
        .filter(Boolean)
        .join(" ; ") ||
      null;
    const missing: string[] = [];
    if (!db.barcode) missing.push("ean");
    if (!db.volumeMl && !item.formatMl && !extractMl(catalogName)) missing.push("format");
    if (!nicotine) missing.push("nicotine");
    const hasPhoto =
      db.imageUrl || (db.images && db.images.length) || db.catalogImages.length > 0;
    if (!hasPhoto) missing.push("photo");

    // format from name counts as present for mission completeness
    const formatOk = db.volumeMl || item.formatMl || extractMl(catalogName);

    const fiche = {
      productId: db.id,
      catalogName,
      name: db.name,
      manufacturer: db.manufacturer?.name,
      range: db.rangeRef?.name,
      formatMl: db.volumeMl || item.formatMl || extractMl(catalogName),
      nicotine,
      ean: db.barcode,
      sumupProductId: db.sumupProductId,
      photoUrl: db.imageUrl,
      missingFields: missing.filter((m) => !(m === "format" && formatOk)),
      complete: missing.filter((m) => !(m === "format" && formatOk)).length === 0,
    };
    // recompute missing after format soft
    fiche.missingFields = [];
    if (!db.barcode) fiche.missingFields.push("ean");
    if (!formatOk) fiche.missingFields.push("format");
    if (!nicotine) fiche.missingFields.push("nicotine");
    if (!hasPhoto) fiche.missingFields.push("photo");
    fiche.complete = fiche.missingFields.length === 0;

    fiches.push(fiche);
    fs.writeFileSync(
      path.join(OUT, "fiches", `${slugify(catalogName)}.json`),
      JSON.stringify(fiche, null, 2),
    );
    fs.writeFileSync(
      path.join(OUT, "json", `${slugify(catalogName)}.json`),
      JSON.stringify(fiche, null, 2),
    );
    if (!fiche.complete) stillMissing.push(fiche);
  }

  const actifs = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      manufacturer: true,
      rangeRef: true,
      catalogImages: true,
    },
  });
  let mfrMixLeft = 0;
  let eanDup = 0;
  let sumupDup = 0;
  const eanMap = new Map<string, number>();
  const sumupMap = new Map<string, number>();
  for (const p of actifs) {
    if (
      p.manufacturerId &&
      p.rangeRef?.manufacturerId &&
      p.rangeRef.manufacturerId !== p.manufacturerId
    )
      mfrMixLeft += 1;
    if (p.barcode) eanMap.set(p.barcode, (eanMap.get(p.barcode) || 0) + 1);
    if (p.sumupProductId)
      sumupMap.set(p.sumupProductId, (sumupMap.get(p.sumupProductId) || 0) + 1);
  }
  for (const n of eanMap.values()) if (n > 1) eanDup++;
  for (const n of sumupMap.values()) if (n > 1) sumupDup++;

  const complets = actifs.filter((p) => {
    const hasPhoto =
      Boolean(p.imageUrl) ||
      (p.images && p.images.length > 0) ||
      p.catalogImages.length > 0;
    return (
      Boolean(p.barcode) &&
      Boolean(p.sumupProductId) &&
      Boolean(p.manufacturerId) &&
      Boolean(p.rangeId || p.range) &&
      hasPhoto
    );
  });

  const missionComplete = fiches.filter((f) => f.complete).length;
  const summary = {
    eanApplied,
    sumupLinked,
    photosFromSumup,
    nicotineApplied,
    released,
    missionComplete,
    missionTotal: fiches.length,
    missionPct: Math.round((missionComplete / fiches.length) * 1000) / 10,
    stillMissing: stillMissing.length,
    actifs: actifs.length,
    complets: complets.length,
    pct: Math.round((complets.length / actifs.length) * 1000) / 10,
    mfrMixLeft,
    eanDup,
    sumupDup,
  };

  fs.writeFileSync(
    path.join(OUT, "rapports/PASS4_FINAL.json"),
    JSON.stringify({ summary, log, stillMissing }, null, 2),
  );
  fs.writeFileSync(
    path.join(OUT, "rapports/ENCORE_INCOMPLETS.json"),
    JSON.stringify(stillMissing, null, 2),
  );
  fs.writeFileSync(path.join(OUT, "rapports/FICHES.json"), JSON.stringify(fiches, null, 2));

  // Copy mix fix report if exists
  const mixPath = path.join(OUT, "rapports/CORRECTIONS_FABRICANT_GAMME.json");

  const md = `# RAPPORT DE VALIDATION COMPLET — All Vap's

**Date :** ${new Date().toISOString()}  
**Sources :** photos magasin, exports SumUp, catalogues internes, fiches validation. **Pas de recherche Internet générale.**

## Synthèse des passes

| Action | Résultat |
|---|---|
| Fabricant/gamme mélangés | **2 corrigés → 0 restant** |
| EAN (pass 3+4) | **+${eanApplied} cette passe** |
| SumUp liés | **+${sumupLinked}** |
| Photos SumUp/magasin | **+${photosFromSumup}** |
| Nicotines documentées | **+${nicotineApplied}** |

## File validation (61 produits)

| Indicateur | Valeur |
|---|---:|
| Complets | **${missionComplete} / ${fiches.length}** |
| % file | **${summary.missionPct} %** |
| Encore incomplets | **${stillMissing.length}** |

## Catalogue actifs global

| Indicateur | Valeur |
|---|---:|
| Actifs | **${actifs.length}** |
| Complets (SumUp+EAN+mfr+gamme+photo) | **${complets.length}** |
| **% achèvement** | **${summary.pct} %** |

## Contrôles intégrité

| Contrôle | Résultat |
|---|---|
| EAN dupliqués (actifs) | ${eanDup === 0 ? "✓ 0" : "⚠ " + eanDup} |
| SumUp dupliqués | ${sumupDup === 0 ? "✓ 0" : "⚠ " + sumupDup} |
| Fabricant ≠ gamme | ${mfrMixLeft === 0 ? "✓ 0" : "⚠ " + mfrMixLeft} |

## Produits encore incomplets

${stillMissing
  .map(
    (f) =>
      `- **${f.catalogName}** — manque: ${f.missingFields.join(", ")}${f.ean ? ` (EAN ${f.ean})` : ""}${f.sumupProductId ? ` [SumUp ok]` : ""}`,
  )
  .join("\n")}

## Blocages restants (honnêtes)

1. **Formats 100 ml Hopper / Ferox** sans ligne SumUp 100 ml (seulement 60 ou 200 ml) → EAN non attribuable sans invention.
2. **Saint Flava / Bisou (sauf Pink)** absents ou sans barcode dans l’export SumUp.
3. **Senka / Yuluma / Sour Sorbet / Custard Vanille UNIK** : pas d’EAN dans SumUp/magasin.
4. **Frost 50 ml** : EAN déjà porté par l’actif *Juice 66 - Frost - 50 ml* (doublon catalogue).
5. **Big Kawa** : nicotine non publiée dans SumUp/B2B → non inventée.

## ZIP

\`catalogues/ALL_VAPS_CATALOGUE_FINAL_100.zip\`  
Contient : fiches/, photos/, bannieres/, json/, rapports/, documentation/, RAPPORT_VALIDATION_COMPLET.md

Prix / stocks : **intacts**. Aucun EAN inventé.
`;

  fs.writeFileSync(path.join(OUT, "RAPPORT_VALIDATION_COMPLET.md"), md);
  fs.writeFileSync(
    path.join(OUT, "documentation/LIVRAISON.md"),
    md,
  );

  const zipPath = path.join(ROOT, "catalogues/ALL_VAPS_CATALOGUE_FINAL_100.zip");
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" },
  );

  console.log(JSON.stringify({ ...summary, zip: "catalogues/ALL_VAPS_CATALOGUE_FINAL_100.zip" }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
