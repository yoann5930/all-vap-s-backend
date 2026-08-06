/**
 * Recherche croisée archives — produits encore incomplets.
 * Sources : Prisma, CSV SumUp, rapports JSON, images public/,
 * catalogues/, data/, backups/, finalisation/, git (chemins).
 * Aucune écriture prix/stock/sumup. Aucune suppression. Aucune invention.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "finalisation", "croisee");
const INCOMPLETE = path.join(
  ROOT,
  "catalogues",
  "finalisation",
  "recherche-web",
  "rapports",
  "ENCORE_IMPOSSIBLES.json",
);
const ALL_HITS = path.join(
  ROOT,
  "catalogues",
  "finalisation",
  "recherche-web",
  "rapports",
  "RECHERCHE_HITS.json",
);

type Incomplete = {
  productId: string;
  catalogName: string;
  manufacturer: string | null;
  range: string | null;
  missingFields?: string[];
  ean?: string | null;
  eanConfidence?: string;
  formatMl?: number | null;
  pgVg?: string | null;
  nicotineSoldAs?: string | null;
  photoLocal?: string | null;
  officialName?: string;
  sourceUrls?: string[];
  notes?: string[];
  status?: string;
};

function ensureDirs() {
  for (const d of [
    "",
    "fiches",
    "photos",
    "bannieres",
    "fabricants",
    "gammes",
    "VALIDATION_MANUELLE",
    "produits-finalises",
    "produits-archives",
    "rapports",
  ]) {
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
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(s: string) {
  return norm(s)
    .split(" ")
    .filter((t) => t && !["ml", "mg", "eliquide", "e", "liquide", "by"].includes(t));
}

function nameScore(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size);
}

function walkFiles(dir: string, exts: string[], max = 50000): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length && out.length < max) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (["node_modules", ".next", ".git"].includes(e.name)) continue;
        stack.push(p);
      } else if (exts.some((x) => e.name.toLowerCase().endsWith(x))) {
        out.push(p);
      }
    }
  }
  return out;
}

function parseCsvLine(line: string): string[] {
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
    } else if (c === "," && !q) {
      cols.push(cur);
      cur = "";
    } else cur += c;
  }
  cols.push(cur);
  return cols;
}

type SumupRow = {
  name: string;
  barcode: string;
  itemId: string;
  image: string;
  category: string;
  qty: string;
};

function loadSumupCsv(file: string): SumupRow[] {
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = (n: string) => header.findIndex((h) => h.toLowerCase() === n.toLowerCase());
  const iName = idx("Item name");
  const iBar = idx("Barcode");
  const iId = idx("Item id (Do not change)");
  const iImg = idx("Image 1");
  const iCat = idx("Category");
  const iQty = idx("Quantity");
  const rows: SumupRow[] = [];
  let buf = "";
  for (let i = 1; i < lines.length; i++) {
    buf += (buf ? "\n" : "") + lines[i];
    const q = (buf.match(/"/g) || []).length;
    if (q % 2 !== 0) continue;
    const cols = parseCsvLine(buf);
    buf = "";
    if (cols.length < 10) continue;
    const name = (cols[iName] || "").replace(/^\t/, "").trim();
    if (!name) continue;
    rows.push({
      name,
      barcode: (cols[iBar] || "").trim(),
      itemId: (cols[iId] || "").trim(),
      image: (cols[iImg] || "").trim(),
      category: (cols[iCat] || "").trim(),
      qty: (cols[iQty] || "").trim(),
    });
  }
  return rows;
}

type ArchiveHit = {
  source: string;
  field: string;
  value: string;
  confidence: "exact_id" | "exact_name" | "strict_name" | "filename" | "sibling_range";
};

function collectJsonEvidence(
  files: string[],
  productId: string,
  catalogName: string,
): ArchiveHit[] {
  const hits: ArchiveHit[] = [];
  const nName = norm(catalogName);
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes(productId) && !text.toLowerCase().includes(nName.slice(0, 12))) continue;
    // lightweight extract barcode/ean near name
    try {
      const data = JSON.parse(text);
      const stack: any[] = [data];
      while (stack.length) {
        const cur = stack.pop();
        if (!cur || typeof cur !== "object") continue;
        if (Array.isArray(cur)) {
          for (const x of cur) stack.push(x);
          continue;
        }
        const id = cur.id || cur.productId || cur.produitCatalogueId;
        const name = cur.name || cur.catalogName || cur.produitCatalogueCandidat || cur.nomSumUp;
        const matchId = id === productId;
        const matchName = name && nameScore(String(name), catalogName) >= 0.85;
        if (matchId || matchName) {
          const conf = matchId ? "exact_id" : "strict_name";
          for (const [field, keys] of [
            ["ean", ["ean", "barcode", "gtin", "EAN", "Barcode"]],
            ["sumupProductId", ["sumupProductId", "itemId", "sumupId"]],
            ["pgVg", ["pgVg", "pgVgLabel", "ratio"]],
            ["nicotine", ["nicotine", "nicotineSoldAs", "nicotineMg", "nicotineLabel"]],
            ["image", ["imageUrl", "photoLocal", "image", "Image 1", "url"]],
            ["manufacturer", ["manufacturer", "fabricant"]],
            ["range", ["range", "gamme"]],
            ["formatMl", ["formatMl", "volumeMl", "format"]],
          ] as const) {
            for (const k of keys) {
              if (cur[k] != null && String(cur[k]).trim()) {
                hits.push({
                  source: path.relative(ROOT, file).replace(/\\/g, "/"),
                  field,
                  value: String(cur[k]),
                  confidence: conf,
                });
              }
            }
          }
        }
        for (const v of Object.values(cur)) {
          if (v && typeof v === "object") stack.push(v);
        }
      }
    } catch {
      // not pure JSON or too large — skip deep parse
    }
  }
  return hits;
}

async function main() {
  ensureDirs();
  const incomplete: Incomplete[] = JSON.parse(fs.readFileSync(INCOMPLETE, "utf8"));
  const allHits: Incomplete[] = fs.existsSync(ALL_HITS)
    ? JSON.parse(fs.readFileSync(ALL_HITS, "utf8"))
    : [];
  const completeWeb = allHits.filter((h) => h.status === "complete");

  const prisma = new PrismaClient();
  const ids = incomplete.map((x) => x.productId);

  const dbProducts = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: {
      manufacturer: true,
      rangeRef: true,
      catalogImages: { orderBy: { sortOrder: "asc" } },
      variants: true,
      brandRef: true,
    },
  });
  const byId = new Map(dbProducts.map((p) => [p.id, p]));

  // Global catalog stats for %
  const actifs = await prisma.product.count({ where: { isActive: true } });
  const actifsComplets = await prisma.product.count({
    where: {
      isActive: true,
      barcode: { not: null },
      sumupProductId: { not: null },
      manufacturerId: { not: null },
      rangeId: { not: null },
      OR: [{ imageUrl: { not: null } }, { imageStatus: "official" }],
      NOT: { barcode: "" },
    },
  });

  // SumUp CSVs
  const sumupFiles = walkFiles(path.join(ROOT, "inbox_sumup"), [".csv"]).concat(
    walkFiles(path.join(ROOT, "backups"), [".csv"]),
    walkFiles(path.join(ROOT, "catalogues"), [".csv"]),
    walkFiles(path.join(ROOT, "data"), [".csv"]),
  );
  const sumupRows: SumupRow[] = [];
  for (const f of sumupFiles) sumupRows.push(...loadSumupCsv(f));

  // Image index
  const imageFiles = walkFiles(path.join(ROOT, "public"), [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
  ]).concat(
    walkFiles(path.join(ROOT, "catalogues"), [".jpg", ".jpeg", ".png", ".webp"]),
    walkFiles(path.join(ROOT, "data"), [".jpg", ".jpeg", ".png", ".webp"]),
  );
  const imageIndex = imageFiles.map((f) => ({
    path: f,
    slug: slugify(path.basename(f, path.extname(f))),
    norm: norm(path.basename(f, path.extname(f))),
  }));

  // JSON archives
  const jsonFiles = walkFiles(path.join(ROOT, "data"), [".json"], 2000)
    .concat(walkFiles(path.join(ROOT, "catalogues"), [".json"], 3000))
    .concat(walkFiles(path.join(ROOT, "backups"), [".json"], 2000))
    .filter(
      (f) =>
        !f.includes("node_modules") &&
        !f.includes("ENCORE_IMPOSSIBLES") &&
        fs.statSync(f).size < 25_000_000,
    );

  // Range banners / covers from public
  const rangeImages = imageFiles.filter((f) => {
    const p = f.replace(/\\/g, "/").toLowerCase();
    return p.includes("/ranges/") || p.includes("banner") || p.includes("cover") || p.includes("gamme");
  });

  // Git path hints (optional)
  let gitTouched: string[] = [];
  try {
    const out = execSync('git log --all --name-only --pretty=format: --max-count=200', {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    gitTouched = out
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((p) => /\.(json|csv|jpg|png|webp|md)$/i.test(p));
  } catch {
    /* no git */
  }

  const results: any[] = [];
  let finalized = 0;
  let fromArchives = 0;
  let photosCopied = 0;
  let bannersMade = 0;

  const manufacturersDone = new Set<string>();
  const rangesDone = new Set<string>();

  for (const item of incomplete) {
    const db = byId.get(item.productId);
    const evidence: ArchiveHit[] = [];
    const notes: string[] = [...(item.notes || [])];

    // 1) Prisma product
    if (db) {
      if (db.barcode) {
        evidence.push({
          source: "prisma:Product.barcode",
          field: "ean",
          value: db.barcode,
          confidence: "exact_id",
        });
      }
      if (db.sumupProductId) {
        evidence.push({
          source: "prisma:Product.sumupProductId",
          field: "sumupProductId",
          value: db.sumupProductId,
          confidence: "exact_id",
        });
      }
      if (db.volumeMl) {
        evidence.push({
          source: "prisma:Product.volumeMl",
          field: "formatMl",
          value: String(db.volumeMl),
          confidence: "exact_id",
        });
      }
      if (db.imageUrl) {
        evidence.push({
          source: "prisma:Product.imageUrl",
          field: "image",
          value: db.imageUrl,
          confidence: "exact_id",
        });
      }
      for (const img of db.catalogImages) {
        if (img.status === "official" || img.status === "validated") {
          evidence.push({
            source: `prisma:ProductImage:${img.status}`,
            field: "image",
            value: img.url,
            confidence: "exact_id",
          });
        }
      }
      for (const img of db.images || []) {
        evidence.push({
          source: "prisma:Product.images[]",
          field: "image",
          value: img,
          confidence: "exact_id",
        });
      }
      for (const v of db.variants) {
        if (v.pgVgLabel) {
          evidence.push({
            source: "prisma:ProductVariant.pgVgLabel",
            field: "pgVg",
            value: v.pgVgLabel,
            confidence: "exact_id",
          });
        }
        if (v.pgRatio != null && v.vgRatio != null) {
          evidence.push({
            source: "prisma:ProductVariant.pg/vg",
            field: "pgVg",
            value: `${v.pgRatio}/${v.vgRatio}`,
            confidence: "exact_id",
          });
        }
        if (v.nicotineMg != null) {
          evidence.push({
            source: "prisma:ProductVariant.nicotineMg",
            field: "nicotine",
            value: `${v.nicotineMg} mg/ml`,
            confidence: "exact_id",
          });
        }
        if (v.nicotineLabel) {
          evidence.push({
            source: "prisma:ProductVariant.nicotineLabel",
            field: "nicotine",
            value: v.nicotineLabel,
            confidence: "exact_id",
          });
        }
        if (v.barcode) {
          evidence.push({
            source: "prisma:ProductVariant.barcode",
            field: "ean",
            value: v.barcode,
            confidence: "exact_id",
          });
        }
      }
      if (db.manufacturer?.name) {
        evidence.push({
          source: "prisma:Manufacturer",
          field: "manufacturer",
          value: db.manufacturer.name,
          confidence: "exact_id",
        });
      }
      if (db.rangeRef?.name) {
        evidence.push({
          source: "prisma:ProductRange",
          field: "range",
          value: db.rangeRef.name,
          confidence: "exact_id",
        });
      }
    }

    // 2) SumUp CSV name match
    const sumMatches = sumupRows
      .map((r) => ({ r, score: nameScore(r.name, item.catalogName) }))
      .filter((x) => x.score >= 0.8)
      .sort((a, b) => b.score - a.score);
    for (const { r, score } of sumMatches.slice(0, 3)) {
      const conf = score >= 0.95 ? "exact_name" : "strict_name";
      if (r.barcode) {
        evidence.push({
          source: `sumup-csv:${r.itemId || r.name}`,
          field: "ean",
          value: r.barcode,
          confidence: conf,
        });
      }
      if (r.itemId) {
        evidence.push({
          source: `sumup-csv:${r.name}`,
          field: "sumupProductId",
          value: r.itemId,
          confidence: conf,
        });
      }
      if (r.image) {
        evidence.push({
          source: `sumup-csv-image:${r.name}`,
          field: "image",
          value: r.image,
          confidence: conf,
        });
      }
      notes.push(`SumUp hit score=${score.toFixed(2)} «${r.name}»`);
    }

    // 3) JSON archives
    evidence.push(
      ...collectJsonEvidence(jsonFiles.slice(0, 800), item.productId, item.catalogName),
    );

    // 4) Filename images
    const nameSlug = slugify(item.catalogName);
    const keyTokens = tokens(item.catalogName).filter((t) => t.length > 2 && !/^\d+$/.test(t));
    const imgHits = imageIndex
      .map((img) => {
        let score = nameScore(img.norm, item.catalogName);
        if (img.slug.includes(nameSlug.slice(0, 20))) score = Math.max(score, 0.9);
        // require main flavor token
        if (keyTokens[0] && !img.norm.includes(keyTokens[0])) score *= 0.5;
        return { img, score };
      })
      .filter((x) => x.score >= 0.75)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    for (const { img, score } of imgHits) {
      evidence.push({
        source: path.relative(ROOT, img.path).replace(/\\/g, "/"),
        field: "image",
        value: path.relative(ROOT, img.path).replace(/\\/g, "/"),
        confidence: score >= 0.9 ? "filename" : "filename",
      });
      notes.push(`Image fichier score=${score.toFixed(2)} ${path.basename(img.path)}`);
    }

    // 5) Git path hints
    for (const gp of gitTouched) {
      if (nameScore(path.basename(gp), item.catalogName) >= 0.85) {
        notes.push(`git history path: ${gp}`);
      }
    }

    // Resolve fields — prefer exact_id > exact_name > strict_name > filename
    const rank = (c: ArchiveHit["confidence"]) =>
      ({ exact_id: 4, exact_name: 3, strict_name: 2, filename: 1, sibling_range: 0 }[c]);

    function pick(field: string, opts?: { require?: RegExp; minConf?: number }) {
      const cands = evidence
        .filter((e) => e.field === field)
        .filter((e) => (opts?.require ? opts.require.test(e.value) : true))
        .sort((a, b) => rank(b.confidence) - rank(a.confidence));
      // conflict detection for ean
      if (field === "ean") {
        const eans = [
          ...new Set(
            cands
              .filter((c) => /^\d{8,14}$/.test(c.value.replace(/\s/g, "")))
              .map((c) => c.value.replace(/\s/g, "")),
          ),
        ];
        if (eans.length > 1) {
          notes.push(`EAN conflictuels archives: ${eans.join(", ")}`);
          return null;
        }
        if (eans.length === 1) {
          const best = cands.find((c) => c.value.replace(/\s/g, "") === eans[0])!;
          if (opts?.minConf && rank(best.confidence) < opts.minConf) return null;
          return { value: eans[0], hit: best };
        }
        return null;
      }
      return cands[0] ? { value: cands[0].value, hit: cands[0] } : null;
    }

    let ean = item.ean && item.eanConfidence !== "conflict" ? item.ean : null;
    let eanConfidence = item.eanConfidence || "missing";
    let eanSource = "";
    const eanPick = pick("ean", { require: /^\d{8,14}$/, minConf: 2 });
    if (eanPick) {
      ean = eanPick.value;
      eanConfidence =
        eanPick.hit.confidence === "exact_id"
          ? "archive_prisma"
          : eanPick.hit.confidence === "exact_name"
            ? "archive_sumup"
            : "archive";
      eanSource = eanPick.hit.source;
      if (!item.ean) fromArchives += 1;
    }

    let formatMl = item.formatMl ?? null;
    const fmtPick = pick("formatMl");
    if (!formatMl && fmtPick) {
      const m = String(fmtPick.value).match(/(\d+)/);
      if (m) formatMl = Number(m[1]);
    }
    if (!formatMl) {
      const m = item.catalogName.match(/(\d+)\s*ml/i);
      if (m) formatMl = Number(m[1]);
    }

    let pgVg = item.pgVg ?? null;
    const pgPick = pick("pgVg");
    if (!pgVg && pgPick) {
      const m = String(pgPick.value).match(/(\d+)\s*[/|:]\s*(\d+)/);
      if (m) pgVg = `${m[1]}/${m[2]}`;
      else if (/50\s*\/\s*50|40\s*\/\s*60|30\s*\/\s*70/.test(String(pgPick.value))) {
        pgVg = String(pgPick.value).replace(/\s/g, "");
      }
    }

    let nicotine = item.nicotineSoldAs ?? null;
    const nicPick = pick("nicotine");
    if (!nicotine && nicPick) nicotine = nicPick.value;

    // Photo: prefer local file copy
    let photoLocal = item.photoLocal ?? null;
    let photoSource = "";
    const imgPick = pick("image");
    if (imgPick) {
      const val = imgPick.value;
      const dest = path.join(OUT, "photos", `${slugify(item.catalogName)}${path.extname(val) || ".jpg"}`);
      if (val.startsWith("http")) {
        // Do not download remote in archive pass unless already have local — keep URL ref only
        notes.push(`Image distante trouvée (non téléchargée auto): ${val}`);
        if (!photoLocal) {
          // keep as reference in fiche
          photoSource = val;
        }
      } else {
        const abs = path.isAbsolute(val) ? val : path.join(ROOT, val);
        if (fs.existsSync(abs)) {
          fs.copyFileSync(abs, dest);
          photoLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
          photoSource = imgPick.hit.source;
          photosCopied += 1;
        }
      }
    }

    // Banner by range
    let bannerLocal: string | null = null;
    if (item.manufacturer && item.range) {
      const rkey = `${item.manufacturer}::${item.range}`;
      const bname = `${slugify(item.manufacturer)}-${slugify(item.range)}.svg`;
      const bdest = path.join(OUT, "bannieres", bname);
      if (!rangesDone.has(rkey)) {
        rangesDone.add(rkey);
        // try find cover
        const cover = rangeImages.find((f) => {
          const n = norm(path.basename(f));
          return n.includes(norm(item.range!).slice(0, 8)) || n.includes(slugify(item.range!).slice(0, 8));
        });
        if (cover) {
          const ext = path.extname(cover);
          const dest = path.join(OUT, "bannieres", `${slugify(item.manufacturer)}-${slugify(item.range)}${ext}`);
          fs.copyFileSync(cover, dest);
          bannerLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
          bannersMade += 1;
        } else {
          const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400" viewBox="0 0 1600 400">
  <rect width="1600" height="400" fill="#0f172a"/>
  <text x="80" y="180" fill="#f8fafc" font-family="Georgia, serif" font-size="56">${item.manufacturer}</text>
  <text x="80" y="260" fill="#94a3b8" font-family="Georgia, serif" font-size="36">${item.range}</text>
  <text x="80" y="330" fill="#64748b" font-size="20">Bannière archive All Vap's — remplacer par visuel officiel si disponible</text>
</svg>`;
          fs.writeFileSync(bdest, svg);
          bannerLocal = path.relative(ROOT, bdest).replace(/\\/g, "/");
          bannersMade += 1;
        }
      } else if (fs.existsSync(bdest)) {
        bannerLocal = path.relative(ROOT, bdest).replace(/\\/g, "/");
      }
    }

    // Manufacturer dossier
    if (item.manufacturer && !manufacturersDone.has(item.manufacturer)) {
      manufacturersDone.add(item.manufacturer);
      fs.writeFileSync(
        path.join(OUT, "fabricants", `${slugify(item.manufacturer)}.json`),
        JSON.stringify(
          {
            name: item.manufacturer,
            productsIncomplete: incomplete.filter((x) => x.manufacturer === item.manufacturer).map((x) => x.catalogName),
            sources: evidence.filter((e) => e.field === "manufacturer").map((e) => e.source),
          },
          null,
          2,
        ),
      );
    }
    if (item.range) {
      fs.writeFileSync(
        path.join(OUT, "gammes", `${slugify(item.range)}.json`),
        JSON.stringify(
          {
            range: item.range,
            manufacturer: item.manufacturer,
            bannerLocal,
          },
          null,
          2,
        ),
      );
    }

    const missing: string[] = [];
    if (!formatMl) missing.push("formatMl");
    if (!pgVg) missing.push("pgVg");
    if (!nicotine) missing.push("nicotine");
    if (!ean || eanConfidence === "conflict" || eanConfidence === "missing") missing.push("ean");
    if (!photoLocal && !photoSource) missing.push("photo");

    const status = missing.length === 0 ? "finalise" : "incomplet";
    if (status === "finalise") finalized += 1;

    const fiche = {
      productId: item.productId,
      catalogName: item.catalogName,
      manufacturer: item.manufacturer,
      range: item.range,
      officialName: item.officialName || db?.name || item.catalogName,
      formatMl,
      pgVg,
      nicotineSoldAs: nicotine,
      ean,
      eanConfidence,
      eanSource,
      sumupProductId: db?.sumupProductId || pick("sumupProductId")?.value || null,
      photoLocal,
      photoSource,
      bannerLocal,
      status,
      missingFields: missing,
      evidence,
      notes,
      recoveredFromArchives: Boolean(eanSource || photoSource || (pgPick && !item.pgVg)),
      constraints: {
        priceUntouched: true,
        stockUntouched: true,
        sumupIdUntouched: true,
        productNotDeleted: true,
        appliedToDatabase: false,
      },
      researchedAt: new Date().toISOString(),
    };

    const fname = `${slugify(item.catalogName)}.json`;
    fs.writeFileSync(path.join(OUT, "fiches", fname), JSON.stringify(fiche, null, 2));

    if (status === "finalise") {
      fs.writeFileSync(path.join(OUT, "produits-finalises", fname), JSON.stringify(fiche, null, 2));
      if (fiche.recoveredFromArchives) {
        fs.writeFileSync(path.join(OUT, "produits-archives", fname), JSON.stringify(fiche, null, 2));
      }
    } else {
      // VALIDATION_MANUELLE pack
      const vdir = path.join(OUT, "VALIDATION_MANUELLE", slugify(item.catalogName));
      fs.mkdirSync(vdir, { recursive: true });
      fs.writeFileSync(path.join(vdir, "fiche.json"), JSON.stringify(fiche, null, 2));
      fs.writeFileSync(
        path.join(vdir, "BLOQUANT.md"),
        `# ${item.catalogName}

## Manque
${missing.map((m) => `- ${m}`).join("\n")}

## Déjà trouvé
- Fabricant: ${item.manufacturer || "?"}
- Gamme: ${item.range || "?"}
- Format: ${formatMl ?? "?"} ml
- PG/VG: ${pgVg ?? "?"}
- Nicotine: ${nicotine ?? "?"}
- EAN: ${ean ?? "?"} (${eanConfidence})
- SumUp: ${fiche.sumupProductId ?? "?"}
- Photo: ${photoLocal || photoSource || "absente"}

## Preuves
${evidence
  .slice(0, 40)
  .map((e) => `- [${e.confidence}] ${e.field}=${e.value} ← ${e.source}`)
  .join("\n") || "_aucune_"}

## Notes
${notes.map((n) => `- ${n}`).join("\n") || "_aucune_"}

## Action
Compléter manuellement les champs manquants à partir d'une source officielle (étiquette, PDF fabricant, facture).
`,
      );
      if (photoLocal && fs.existsSync(path.join(ROOT, photoLocal))) {
        fs.copyFileSync(path.join(ROOT, photoLocal), path.join(vdir, path.basename(photoLocal)));
      }
    }

    results.push(fiche);
  }

  await prisma.$disconnect();

  // Overall mission completion among the 98 researched products
  const missionTotal = allHits.length || incomplete.length + completeWeb.length;
  const missionDone = completeWeb.length + finalized;
  const missionPct = missionTotal
    ? Math.round((missionDone / missionTotal) * 1000) / 10
    : 0;

  // Catalog % (actifs with SumUp+EAN+mfr+range+image)
  const catalogPct = actifs ? Math.round((actifsComplets / actifs) * 1000) / 10 : 0;

  const still = results.filter((r) => r.status !== "finalise");
  const archivedRecovered = results.filter((r) => r.recoveredFromArchives && r.status === "finalise");

  const report = `# Rapport — Finalisation définitive (recherche croisée archives)

**Date :** ${new Date().toISOString()}  
**Dossier :** \`catalogues/finalisation/croisee/\`  
**Entrée :** ${incomplete.length} produits incomplets après recherche web  

## Contraintes

- Aucune invention
- Aucun prix / stock modifié
- Aucun produit supprimé
- Aucun sumupProductId remplacé en base
- Fiches générées hors base (pas d'apply auto)

## Synthèse demandée

| Indicateur | Nb |
|---|---:|
| Produits totalement finalisés (cette passe archives) | **${finalized}** |
| Produits récupérés grâce aux archives (parmi finalisés) | **${archivedRecovered.length}** |
| Produits encore incomplets → VALIDATION_MANUELLE | **${still.length}** |
| Photos copiées depuis le projet | **${photosCopied}** |
| Bannières créées/reprises | **${bannersMade}** |
| Déjà complets (passe web précédente) | **${completeWeb.length}** |
| Total mission 98 (web + archives finalisés) | **${missionDone} / ${missionTotal}** |
| **% achèvement mission (98 restants)** | **${missionPct} %** |
| Produits actifs catalogue | **${actifs}** |
| Actifs « complets » (SumUp+EAN+fabricant+gamme+image) | **${actifsComplets}** |
| **% achèvement réel catalogue actifs** | **${catalogPct} %** |

## Produits finalisés (archives)

${results
  .filter((r) => r.status === "finalise")
  .map(
    (r) =>
      `- **${r.catalogName}** — EAN \`${r.ean}\` (${r.eanConfidence}${r.eanSource ? " ← " + r.eanSource : ""})`,
  )
  .join("\n") || "_Aucun nouveau finalisé uniquement via archives_"}

## Produits encore incomplets — raison précise

${still
  .map(
    (r) =>
      `- **${r.catalogName}** (${r.manufacturer || "?"} / ${r.range || "?"}) — blocage: **${r.missingFields.join(", ")}**${
        (r.notes || []).find((n: string) => /conflict|SumUp hit|Image/i.test(n))
          ? " · " + (r.notes || []).find((n: string) => /conflict|SumUp hit|Image/i.test(n))
          : ""
      }`,
  )
  .join("\n")}

## VALIDATION_MANUELLE

Chaque produit incomplet a un dossier :

\`catalogues/finalisation/croisee/VALIDATION_MANUELLE/<slug>/\`

contenant \`fiche.json\` + \`BLOQUANT.md\` + photo locale si disponible.
`;

  fs.writeFileSync(path.join(OUT, "RAPPORT_FINALISATION_DEFINITIVE.md"), report);
  fs.writeFileSync(path.join(OUT, "rapports", "RESULTATS.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT, "rapports", "ENCORE_INCOMPLETS.json"), JSON.stringify(still, null, 2));

  console.log(
    JSON.stringify(
      {
        incompleteIn: incomplete.length,
        finalized,
        fromArchivesFinalized: archivedRecovered.length,
        stillIncomplete: still.length,
        photosCopied,
        bannersMade,
        completeWeb: completeWeb.length,
        missionDone,
        missionTotal,
        missionPct,
        actifs,
        actifsComplets,
        catalogPct,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
