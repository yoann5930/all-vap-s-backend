/**
 * Pass 3 — Transfert EAN / SumUp depuis fiches INACTIVES vers produits actifs de la file.
 * Strict : nom+volume univoque. Ne touche jamais prix/stock. Ne désactive/supprime rien.
 * Libère barcode/sumupProductId sur la fiche inactive source avant transfert.
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
    )
    .filter((t) => !/^\d+$/.test(t));
}

function extractMl(s: string): number | null {
  const m = s.match(/(\d+)\s*ml/i);
  return m ? Number(m[1]) : null;
}

function flavorMatch(a: string, b: string) {
  const fa = tokens(a);
  if (!fa.length) return 0;
  const nb = norm(b);
  return fa.filter((t) => nb.includes(t)).length / fa.length;
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

/** Require brand/range token when catalog manufacturer known — reduces Café Caramel multi-hits */
function brandHintOk(catalogName: string, sumupName: string, brandHints: string[]) {
  if (!brandHints.length) return true;
  const ns = norm(sumupName);
  // If any brand hint appears in SumUp name, good.
  // If none appear in SumUp but also none conflict with another known rival, still allow
  // only when unique candidate overall (checked outside).
  return brandHints.some((h) => ns.includes(norm(h)));
}

async function main() {
  ensure();
  const prisma = new PrismaClient();
  const enrich: any[] = JSON.parse(fs.readFileSync(ENRICH, "utf8"));
  const sumup = loadCsv(SUMUP);

  const transfers: any[] = [];
  let eanApplied = 0;
  let sumupLinked = 0;
  let nicotineApplied = 0;
  let formatApplied = 0;
  let photosLinked = 0;
  let releasedFromInactive = 0;

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

    const brandHints = [
      db.manufacturer?.name,
      db.rangeRef?.name,
      item.manufacturer,
      item.range,
    ].filter(Boolean) as string[];

    if (!db.volumeMl && catalogMl) {
      updates.volumeMl = catalogMl;
      formatApplied += 1;
    }

    // Candidates SumUp
    let candidates = sumup.filter((r) => {
      const n = r["Item name"] || "";
      const cat = r["Category"] || "";
      const ml = extractMl(n) ?? extractMl(cat);
      if (flavorMatch(catalogName, n) < 0.99) return false;
      if (catalogMl != null && ml != null && catalogMl !== ml) return false;
      if (catalogMl != null && ml == null) return false;
      return true;
    });

    // If multi, prefer those with brand hint
    if (candidates.length > 1) {
      const branded = candidates.filter((r) =>
        brandHintOk(catalogName, r["Item name"] || "", brandHints),
      );
      if (branded.length === 1) candidates = branded;
      else if (branded.length > 1) candidates = branded;
    }

    // Reject MULTI barcode unless single after brand filter
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
    else if (barcodes.length === 1 && candidates.length >= 1) {
      chosen = candidates.find((c) => c.Barcode === barcodes[0]) || candidates[0];
    } else if (candidates.length === 1) chosen = candidates[0];
    else if (candidates.length > 1) {
      notes.push(
        `MULTI SumUp non résolu (${candidates.length}): ${candidates
          .slice(0, 3)
          .map((c) => c["Item name"])
          .join(" | ")}`,
      );
    }

    let ean = db.barcode || null;

    if (chosen) {
      const sid = chosen["Item id (Do not change)"];
      const bc = chosen.Barcode || "";

      // Transfer SumUp ID
      if (!db.sumupProductId && sid) {
        const holder = await prisma.product.findFirst({
          where: { sumupProductId: sid, NOT: { id: db.id } },
        });
        if (holder && !holder.isActive) {
          await prisma.product.update({
            where: { id: holder.id },
            data: { sumupProductId: null },
          });
          releasedFromInactive += 1;
          updates.sumupProductId = sid;
          sumupLinked += 1;
          notes.push(
            `SumUp ID transféré depuis inactif «${holder.name}» → ${sid}`,
          );
        } else if (!holder) {
          updates.sumupProductId = sid;
          sumupLinked += 1;
          notes.push(`SumUp ID lié: ${sid}`);
        } else {
          notes.push(
            `SumUp ID ${sid} déjà sur actif «${holder.name}» — non transféré`,
          );
        }
      }

      // Transfer EAN
      if (!ean && /^\d{8,14}$/.test(bc)) {
        const holders = await prisma.product.findMany({
          where: { barcode: bc, NOT: { id: db.id } },
        });
        const activeHolders = holders.filter((h) => h.isActive);
        const inactiveHolders = holders.filter((h) => !h.isActive);

        if (activeHolders.length === 0) {
          for (const h of inactiveHolders) {
            await prisma.product.update({
              where: { id: h.id },
              data: { barcode: null },
            });
            releasedFromInactive += 1;
            notes.push(`EAN libéré depuis inactif «${h.name}»`);
          }
          updates.barcode = bc;
          ean = bc;
          eanApplied += 1;
          notes.push(`EAN appliqué: ${bc} «${chosen["Item name"]}»`);
          transfers.push({
            productId: db.id,
            name: catalogName,
            ean: bc,
            sumupId: sid,
            fromInactive: inactiveHolders.map((h) => h.id),
          });
        } else {
          notes.push(
            `EAN ${bc} déjà sur ACTIF «${activeHolders[0].name}» — non appliqué`,
          );
        }
      }
    }

    // Enrich retailer EAN (Mûre Cassis) if still free
    if (
      !ean &&
      item.ean &&
      ["retailer", "official", "validated"].includes(
        String(item.eanConfidence || "").toLowerCase(),
      )
    ) {
      const holders = await prisma.product.findMany({
        where: { barcode: item.ean, NOT: { id: db.id } },
      });
      const activeHolders = holders.filter((h) => h.isActive);
      if (activeHolders.length === 0) {
        for (const h of holders) {
          if (!h.isActive) {
            await prisma.product.update({
              where: { id: h.id },
              data: { barcode: null },
            });
            releasedFromInactive += 1;
          }
        }
        updates.barcode = item.ean;
        ean = item.ean;
        eanApplied += 1;
        notes.push(`EAN enrich (${item.eanConfidence}): ${item.ean}`);
      }
    }

    // Nicotine
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
    const keyToks = tokens(catalogName);
    const photoHits = storePhotos
      .map((f) => {
        const base = norm(path.basename(f, path.extname(f)));
        const hit = keyToks.filter((t) => base.includes(t)).length;
        let s = keyToks.length ? hit / keyToks.length : 0;
        const rel = f.replace(/\\/g, "/").toLowerCase();
        if (db.manufacturer?.slug && rel.includes(`/${db.manufacturer.slug}/`)) s += 0.2;
        if (rel.includes("/ranges/") || rel.includes("banner") || rel.includes("banniere"))
          s -= 0.6;
        return { f, s };
      })
      .filter((x) => x.s >= 0.85)
      .sort((a, b) => b.s - a.s);

    if (photoHits[0]) {
      const abs = photoHits[0].f;
      fs.copyFileSync(
        abs,
        path.join(OUT, "photos", `${slugify(catalogName)}${path.extname(abs)}`),
      );
      photosLinked += 1;
      if (!db.imageUrl && abs.includes(`${path.sep}public${path.sep}`)) {
        const relPublic =
          "/" + path.relative(path.join(ROOT, "public"), abs).replace(/\\/g, "/");
        updates.imageUrl = relPublic;
        updates.imageStatus = "validated";
        photoUrl = relPublic;
      } else if (!photoUrl) {
        photoUrl = path.relative(ROOT, abs).replace(/\\/g, "/");
      }
    } else if (item.photoLocal && fs.existsSync(path.join(ROOT, item.photoLocal))) {
      fs.copyFileSync(
        path.join(ROOT, item.photoLocal),
        path.join(
          OUT,
          "photos",
          `${slugify(catalogName)}${path.extname(item.photoLocal)}`,
        ),
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
  }

  // Global
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
  for (const n of eanMap.values()) if (n > 1) eanDup += 1;
  for (const n of sumupMap.values()) if (n > 1) sumupDup += 1;

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
    releasedFromInactive,
    formatApplied,
    nicotineApplied,
    photosLinked,
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
    eanDup,
    sumupDup,
    transfers: transfers.length,
  };

  fs.writeFileSync(
    path.join(OUT, "rapports/PASS3_TRANSFERT_EAN.json"),
    JSON.stringify({ summary, transfers, stillMissing, fiches }, null, 2),
  );
  fs.writeFileSync(
    path.join(OUT, "rapports/ENCORE_INCOMPLETS.json"),
    JSON.stringify(stillMissing, null, 2),
  );
  fs.writeFileSync(path.join(OUT, "rapports/FICHES.json"), JSON.stringify(fiches, null, 2));

  const md = `# RAPPORT DE VALIDATION COMPLET — Catalogue All Vap's

**Date :** ${new Date().toISOString()}  
**Sources internes uniquement** (photos magasin, SumUp, catalogues, documents). Aucune recherche Internet générale.

## Actions (pass 3 — transfert depuis fiches inactives)

| Action | Nb |
|---|---:|
| EAN appliqués | **${eanApplied}** |
| SumUp ID liés | **${sumupLinked}** |
| Libérations depuis inactifs | **${releasedFromInactive}** |
| Formats | **${formatApplied}** |
| Nicotines | **${nicotineApplied}** |
| Photos | **${photosLinked}** |
| Fabricant/gamme restants | **${mfrMixLeft}** |

## File validation (61)

| Indicateur | Valeur |
|---|---:|
| Complets | **${missionComplete} / ${fiches.length}** |
| % file | **${summary.missionPct} %** |
| Encore incomplets | **${stillMissing.length}** |

## Catalogue actifs

| Indicateur | Valeur |
|---|---:|
| Actifs | **${actifs.length}** |
| Complets (SumUp+EAN+mfr+gamme+photo) | **${complets.length}** |
| **% achèvement** | **${summary.pct} %** |

## Contrôles

| Contrôle | Résultat |
|---|---|
| EAN dupliqués | ${eanDup === 0 ? "✓ 0" : "⚠ " + eanDup} |
| SumUp dupliqués | ${sumupDup === 0 ? "✓ 0" : "⚠ " + sumupDup} |
| Fabricant/gamme | ${mfrMixLeft === 0 ? "✓ 0" : "⚠ " + mfrMixLeft} |
| Photos path ≠ fabricant | ${photoMismatch === 0 ? "✓ 0" : "⚠ " + photoMismatch} |

## Encore incomplets

${stillMissing
  .map((f) => `- **${f.catalogName}** — manque: ${f.missingFields.join(", ")}`)
  .join("\n") || "_Aucun_"}

## Verdict

${
  stillMissing.length === 0
    ? "**File validation à 100 %.**"
    : `**${stillMissing.length} produit(s)** restent bloqués (pas d’EAN SumUp univoque au bon volume, ou conflit multi-candidats). Aucun EAN inventé. Prix/stocks intacts.`
}

## ZIP

\`catalogues/ALL_VAPS_CATALOGUE_FINAL_100.zip\`
`;

  fs.writeFileSync(path.join(OUT, "RAPPORT_VALIDATION_COMPLET.md"), md);
  fs.writeFileSync(
    path.join(OUT, "documentation/README.md"),
    `# Catalogue final All Vap's\n\nVoir RAPPORT_VALIDATION_COMPLET.md à la racine du dossier.\n`,
  );

  const zipPath = path.join(ROOT, "catalogues/ALL_VAPS_CATALOGUE_FINAL_100.zip");
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" },
  );

  console.log(JSON.stringify({ ...summary, zipPath: "catalogues/ALL_VAPS_CATALOGUE_FINAL_100.zip" }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
