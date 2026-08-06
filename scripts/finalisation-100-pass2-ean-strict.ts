/**
 * Pass 2 finalisation — EAN SumUp strict (ID lié OU nom+volume univoque).
 * Nicotine/format depuis enrich + SumUp. Photos magasin. Regénère ZIP.
 * Ne jamais inventer / mélanger volumes / écraser EAN/SumUp/prix/stock.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "final-100");
const ENRICH = path.join(ROOT, "catalogues/validation-finale/ENRICHISSEMENT_PUBLIC.json");
const SUMUP = path.join(ROOT, "inbox_sumup/2026-08-03_16-46-54_items-export_MCGR4RXU.csv");

function ensure() {
  for (const d of ["", "fiches", "photos", "bannieres", "json", "rapports", "documentation"]) {
    fs.mkdirSync(path.join(OUT, d), { recursive: true });
  }
}

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
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
        !["ml", "mg", "by", "e", "liquide", "eliquide", "swoke", "airmust", "hopper"].includes(t),
    );
}

function extractMl(s: string): number | null {
  const m = s.match(/(\d+)\s*ml/i);
  return m ? Number(m[1]) : null;
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
  const delim = ",";
  const headers = parseDelimited(lines[0], delim).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  let buf = "";
  for (let i = 1; i < lines.length; i++) {
    buf += (buf ? "\n" : "") + lines[i];
    if (((buf.match(/"/g) || []).length) % 2) continue;
    const cols = parseDelimited(buf, delim);
    buf = "";
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || "").replace(/^\t/, "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function flavorCore(name: string) {
  // drop volume tokens
  return tokens(name).filter((t) => !/^\d+$/.test(t));
}

function flavorMatch(a: string, b: string) {
  const fa = flavorCore(a);
  const fb = flavorCore(b);
  if (!fa.length || !fb.length) return 0;
  // require all catalog flavor tokens (minus generic brand noise) present in sumup
  // OR high overlap
  const setB = new Set(fb);
  const hit = fa.filter((t) => setB.has(t) || norm(b).includes(t)).length;
  return hit / fa.length;
}

function walk(dir: string, exts: string[]) {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (["node_modules", ".next", ".git"].includes(e.name)) continue;
        stack.push(p);
      } else if (exts.some((x) => e.name.toLowerCase().endsWith(x))) out.push(p);
    }
  }
  return out;
}

async function main() {
  ensure();
  const prisma = new PrismaClient();
  const enrich: any[] = JSON.parse(fs.readFileSync(ENRICH, "utf8"));
  const sumup = loadCsv(SUMUP);

  const byId = new Map(
    sumup.map((r) => [r["Item id (Do not change)"], r]),
  );

  const log: any[] = [];
  let eanApplied = 0;
  let nicotineApplied = 0;
  let formatApplied = 0;
  let photosLinked = 0;
  let sumupLinked = 0;

  const storePhotos = walk(path.join(ROOT, "public/media/products"), [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
  ]).concat(
    walk(path.join(ROOT, "catalogues/validation-finale"), [".jpg", ".jpeg", ".png", ".webp"]),
  );

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
    const catalogMl = db.volumeMl || item.formatMl || extractMl(catalogName);
    const notes: string[] = [];
    const updates: Record<string, unknown> = {};

    // Format
    if (!db.volumeMl && catalogMl) {
      updates.volumeMl = catalogMl;
      formatApplied += 1;
      notes.push(`format: ${catalogMl} ml`);
    }

    // ——— EAN via SumUp ID already linked ———
    let ean = db.barcode || null;
    let sumupRow: Record<string, string> | undefined;

    if (db.sumupProductId && byId.has(db.sumupProductId)) {
      sumupRow = byId.get(db.sumupProductId);
    }

    // ——— EAN / SumUp via strict flavor + volume ———
    if (!sumupRow) {
      const candidates = sumup.filter((r) => {
        const n = r["Item name"] || "";
        const cat = r["Category"] || r["Category name"] || "";
        // Volume: nom d'abord, sinon catégorie SumUp (ex. 06.E-liquide 50ml)
        const ml = extractMl(n) ?? extractMl(cat);
        const fm = flavorMatch(catalogName, n);
        if (fm < 0.99) return false; // all catalog flavor tokens must match
        if (catalogMl != null && ml != null && catalogMl !== ml) return false;
        // Si volume catalogue connu et SumUp sans volume → rejeter (évite 100↔200)
        if (catalogMl != null && ml == null) return false;
        return true;
      });

      // Prefer exact unique barcode
      const withBc = candidates.filter((r) => /^\d{8,14}$/.test(r.Barcode || ""));
      const barcodes = [...new Set(withBc.map((r) => r.Barcode))];
      const ids = [...new Set(candidates.map((r) => r["Item id (Do not change)"]))];

      if (ids.length === 1) {
        sumupRow = byId.get(ids[0]);
      } else if (barcodes.length === 1 && withBc.length >= 1) {
        // same barcode across candidates OK
        sumupRow = withBc[0];
      } else if (candidates.length === 1) {
        sumupRow = candidates[0];
      } else if (candidates.length > 1) {
        notes.push(
          `SumUp multi-candidats (${candidates.length}): ${candidates
            .slice(0, 3)
            .map((c) => c["Item name"])
            .join(" | ")}`,
        );
      }
    }

    if (sumupRow) {
      const sid = sumupRow["Item id (Do not change)"];
      const bc = sumupRow.Barcode || "";

      if (!db.sumupProductId && sid) {
        const clash = await prisma.product.findFirst({
          where: { sumupProductId: sid, NOT: { id: db.id } },
        });
        if (!clash) {
          updates.sumupProductId = sid;
          sumupLinked += 1;
          notes.push(`SumUp ID lié: ${sid} «${sumupRow["Item name"]}»`);
        }
      }

      if (!ean && /^\d{8,14}$/.test(bc)) {
        const clash = await prisma.product.findFirst({
          where: { barcode: bc, NOT: { id: db.id } },
        });
        // volume safety: if clash, reject; also reject if another active product same barcode
        if (!clash) {
          updates.barcode = bc;
          ean = bc;
          eanApplied += 1;
          notes.push(`EAN SumUp: ${bc} «${sumupRow["Item name"]}»`);
        } else {
          notes.push(`EAN ${bc} déjà sur autre produit — non appliqué`);
        }
      }
    }

    // Enrich EAN only if confidence retailer/official and unique (Mûre Cassis)
    if (
      !ean &&
      item.ean &&
      item.eanConfidence &&
      ["retailer", "official", "validated", "eleve"].includes(String(item.eanConfidence).toLowerCase())
    ) {
      const clash = await prisma.product.findFirst({
        where: { barcode: item.ean, NOT: { id: db.id } },
      });
      if (!clash) {
        updates.barcode = item.ean;
        ean = item.ean;
        eanApplied += 1;
        notes.push(`EAN enrich validé (${item.eanConfidence}): ${item.ean}`);
      }
    }

    // Nicotine from enrich
    let nicotine =
      item.nicotine && !/non (publié|trouvé|renseign)/i.test(item.nicotine)
        ? item.nicotine
        : db.variants
            .map((v) => v.nicotineLabel || (v.nicotineMg != null ? `${v.nicotineMg} mg` : null))
            .filter(Boolean)
            .join(" ; ") || null;

    if (nicotine && /0\s*mg/i.test(nicotine)) {
      for (const v of db.variants) {
        if (v.nicotineMg == null && !v.nicotineLabel) {
          await prisma.productVariant.update({
            where: { id: v.id },
            data: { nicotineMg: 0, nicotineLabel: "0 mg/ml" },
          });
          nicotineApplied += 1;
        }
      }
    } else if (!nicotine && catalogMl && catalogMl >= 50) {
      // Shortfills magasin typiques 50/60/100/200 ml → 0 mg base (documenté enrich souvent)
      if (item.nicotine && /0/.test(item.nicotine)) {
        nicotine = item.nicotine;
      }
    }

    if (item.pgVg && /(\d+)\s*\/\s*(\d+)/.test(String(item.pgVg))) {
      const m = String(item.pgVg).match(/(\d+)\s*\/\s*(\d+)/)!;
      for (const v of db.variants) {
        if (v.pgRatio == null || v.vgRatio == null) {
          await prisma.productVariant.update({
            where: { id: v.id },
            data: {
              pgRatio: Number(m[1]),
              vgRatio: Number(m[2]),
              pgVgLabel: `${m[1]}/${m[2]}`,
            },
          });
        }
      }
    }

    // Photos
    let photoUrl = db.imageUrl;
    const keyToks = flavorCore(catalogName);
    const photoHits = storePhotos
      .map((f) => {
        const base = norm(path.basename(f, path.extname(f)));
        const hit = keyToks.filter((t) => base.includes(t)).length;
        const score = keyToks.length ? hit / keyToks.length : 0;
        const rel = f.replace(/\\/g, "/").toLowerCase();
        let s = score;
        if (db.manufacturer?.slug && rel.includes(`/${db.manufacturer.slug}/`)) s += 0.2;
        if (rel.includes("/ranges/") || rel.includes("banner") || rel.includes("banniere"))
          s -= 0.6;
        return { f, s };
      })
      .filter((x) => x.s >= 0.85)
      .sort((a, b) => b.s - a.s);

    if (photoHits[0]) {
      const abs = photoHits[0].f;
      const dest = path.join(OUT, "photos", `${slugify(catalogName)}${path.extname(abs)}`);
      fs.copyFileSync(abs, dest);
      photosLinked += 1;
      if (!db.imageUrl && abs.includes(`${path.sep}public${path.sep}`)) {
        const relPublic =
          "/" + path.relative(path.join(ROOT, "public"), abs).replace(/\\/g, "/");
        updates.imageUrl = relPublic;
        updates.imageStatus = "validated";
        photoUrl = relPublic;
        notes.push(`photo: ${relPublic}`);
      } else if (!photoUrl) {
        photoUrl = path.relative(ROOT, abs).replace(/\\/g, "/");
      }
    } else if (item.photoLocal && fs.existsSync(path.join(ROOT, item.photoLocal))) {
      const abs = path.join(ROOT, item.photoLocal);
      fs.copyFileSync(
        abs,
        path.join(OUT, "photos", `${slugify(catalogName)}${path.extname(abs)}`),
      );
      photosLinked += 1;
      photoUrl = item.photoLocal;
    }

    // Banner
    let bannerPath: string | null = null;
    if (db.manufacturer?.slug && db.rangeRef?.name) {
      const banners = walk(
        path.join(ROOT, "public/media/manufacturers", db.manufacturer.slug, "ranges"),
        [".webp", ".png", ".jpg", ".jpeg"],
      );
      const rs = slugify(db.rangeRef.name).slice(0, 10);
      const hit = banners.find((f) => slugify(path.basename(f)).includes(rs));
      if (hit) {
        const dest = path.join(
          OUT,
          "bannieres",
          `${db.manufacturer.slug}-${slugify(db.rangeRef.name)}${path.extname(hit)}`,
        );
        if (!fs.existsSync(dest)) fs.copyFileSync(hit, dest);
        bannerPath = path.relative(ROOT, dest).replace(/\\/g, "/");
      }
    }

    if (Object.keys(updates).length) {
      await prisma.product.update({ where: { id: db.id }, data: updates });
    }

    const finalDb = await prisma.product.findUnique({
      where: { id: db.id },
      include: { variants: true, catalogImages: true },
    });

    const missing: string[] = [];
    if (!finalDb?.barcode) missing.push("ean");
    if (!finalDb?.volumeMl) missing.push("format");
    const hasNic =
      nicotine ||
      finalDb?.variants.some((v) => v.nicotineMg != null || v.nicotineLabel);
    if (!hasNic) missing.push("nicotine");
    const hasPhoto =
      finalDb?.imageUrl ||
      (finalDb?.images && finalDb.images.length) ||
      (finalDb?.catalogImages?.length ?? 0) > 0 ||
      photoUrl;
    if (!hasPhoto) missing.push("photo");

    const fiche = {
      productId: db.id,
      name: db.name,
      catalogName,
      manufacturer: db.manufacturer?.name,
      range: db.rangeRef?.name,
      formatMl: finalDb?.volumeMl,
      nicotine: nicotine || null,
      ean: finalDb?.barcode || null,
      sumupProductId: finalDb?.sumupProductId || null,
      photoUrl: finalDb?.imageUrl || photoUrl || null,
      bannerPath,
      missingFields: missing,
      complete: missing.length === 0,
      notes,
    };
    fiches.push(fiche);
    fs.writeFileSync(
      path.join(OUT, "fiches", `${slugify(catalogName)}.json`),
      JSON.stringify(fiche, null, 2),
    );
    fs.writeFileSync(
      path.join(OUT, "json", `${slugify(catalogName)}.json`),
      JSON.stringify(fiche, null, 2),
    );
    if (missing.length) stillMissing.push(fiche);
    log.push({ name: catalogName, notes, missing, ean: fiche.ean });
  }

  // Global audit
  const actifs = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      manufacturer: true,
      rangeRef: true,
      catalogImages: true,
      variants: true,
    },
  });

  let mfrMixLeft = 0;
  let photoMismatch = 0;
  const eanDup: string[] = [];
  const sumupDup: string[] = [];
  const eanMap = new Map<string, string[]>();
  const sumupMap = new Map<string, string[]>();

  for (const p of actifs) {
    if (
      p.manufacturerId &&
      p.rangeRef?.manufacturerId &&
      p.rangeRef.manufacturerId !== p.manufacturerId
    )
      mfrMixLeft += 1;
    if (p.barcode) eanMap.set(p.barcode, [...(eanMap.get(p.barcode) || []), p.id]);
    if (p.sumupProductId)
      sumupMap.set(p.sumupProductId, [...(sumupMap.get(p.sumupProductId) || []), p.id]);
    if (p.imageUrl && p.manufacturer?.slug) {
      const m = p.imageUrl.toLowerCase().match(/\/(?:products|media\/products)\/([^/]+)\//);
      if (m) {
        const folder = m[1];
        const slug = p.manufacturer.slug;
        if (
          folder !== slug &&
          !folder.includes(slug.slice(0, 6)) &&
          !slug.includes(folder.slice(0, 6))
        )
          photoMismatch += 1;
      }
    }
  }
  for (const [k, v] of eanMap) if (v.length > 1) eanDup.push(k);
  for (const [k, v] of sumupMap) if (v.length > 1) sumupDup.push(k);

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
    formatApplied,
    nicotineApplied,
    photosLinked,
    sumupLinked,
    missionComplete,
    missionTotal: fiches.length,
    missionPct: fiches.length
      ? Math.round((missionComplete / fiches.length) * 1000) / 10
      : 0,
    stillMissing: stillMissing.length,
    actifs: actifs.length,
    complets: complets.length,
    pct: Math.round((complets.length / actifs.length) * 1000) / 10,
    mfrMixLeft,
    photoMismatch,
    eanDup: eanDup.length,
    sumupDup: sumupDup.length,
  };

  fs.writeFileSync(
    path.join(OUT, "rapports/PASS2_EAN_STRICT.json"),
    JSON.stringify({ summary, log, stillMissing }, null, 2),
  );
  fs.writeFileSync(
    path.join(OUT, "rapports/ENCORE_INCOMPLETS.json"),
    JSON.stringify(stillMissing, null, 2),
  );
  fs.writeFileSync(path.join(OUT, "rapports/FICHES.json"), JSON.stringify(fiches, null, 2));

  const md = `# RAPPORT DE VALIDATION COMPLET — Catalogue All Vap's

**Date :** ${new Date().toISOString()}  
**Sources :** photos magasin, exports SumUp, catalogues magasin/fournisseurs, fiches internes. **Aucune recherche Internet générale.**

## Pass 2 — EAN / SumUp strict (nom + volume)

| Action | Nb |
|---|---:|
| EAN appliqués | **${eanApplied}** |
| SumUp ID liés | **${sumupLinked}** |
| Formats | **${formatApplied}** |
| Nicotines variantes | **${nicotineApplied}** |
| Photos pack | **${photosLinked}** |
| Fabricant/gamme mélangés restants | **${mfrMixLeft}** |

## File validation (61)

| Indicateur | Valeur |
|---|---:|
| Complets (EAN+format+nicotine+photo) | **${missionComplete}** |
| Encore incomplets | **${stillMissing.length}** |
| % file | **${summary.missionPct} %** |

## Catalogue actifs

| Indicateur | Valeur |
|---|---:|
| Actifs | **${actifs.length}** |
| Complets (SumUp+EAN+mfr+gamme+photo) | **${complets.length}** |
| **% achèvement** | **${summary.pct} %** |

## Contrôles

| Contrôle | Résultat |
|---|---|
| EAN dupliqués | ${eanDup.length === 0 ? "✓ 0" : "⚠ " + eanDup.length} |
| SumUp ID dupliqués | ${sumupDup.length === 0 ? "✓ 0" : "⚠ " + sumupDup.length} |
| Fabricant/gamme | ${mfrMixLeft === 0 ? "✓ 0" : "⚠ " + mfrMixLeft} |
| Photos path ≠ fabricant (heuristique) | ${photoMismatch === 0 ? "✓ 0" : "⚠ " + photoMismatch} |

## Encore incomplets (EAN absent ou non univoque en interne)

${stillMissing
  .map((f) => `- **${f.catalogName || f.name}** — manque: ${f.missingFields.join(", ")}`)
  .join("\n")}

## Verdict

${
  stillMissing.length === 0
    ? "**Catalogue file validation à 100 %.**"
    : `**${stillMissing.length} produit(s)** restent bloqués (EAN absent de SumUp au format exact, ou match volume ambigu). Aucun EAN inventé. Prix / stocks / SumUp ID existants : **intacts**.`
}

## Livrable ZIP

\`catalogues/ALL_VAPS_CATALOGUE_FINAL_100.zip\`
`;

  fs.writeFileSync(path.join(OUT, "RAPPORT_VALIDATION_COMPLET.md"), md);
  fs.writeFileSync(
    path.join(OUT, "documentation/README.md"),
    `# Catalogue final All Vap's\n\nVoir \`RAPPORT_VALIDATION_COMPLET.md\`.\n\nContenu ZIP : fiches/, photos/, bannieres/, json/, rapports/, documentation/.\n`,
  );

  // ZIP
  const zipPath = path.join(ROOT, "catalogues/ALL_VAPS_CATALOGUE_FINAL_100.zip");
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" },
  );

  console.log(JSON.stringify({ ...summary, zipPath: path.relative(ROOT, zipPath) }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
