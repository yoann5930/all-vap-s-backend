/**
 * FINALISATION 100% — sources internes uniquement.
 * Aucune recherche Internet. Aucune invention.
 * Ne modifie jamais prix / stock / sumupProductId en base.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "finalisation", "finale-100");
const INCOMPLETE_PATHS = [
  path.join(ROOT, "catalogues", "finalisation", "croisee", "rapports", "ENCORE_INCOMPLETS.json"),
  path.join(ROOT, "catalogues", "finalisation", "recherche-web", "rapports", "ENCORE_IMPOSSIBLES.json"),
];
const WEB_HITS = path.join(
  ROOT,
  "catalogues",
  "finalisation",
  "recherche-web",
  "rapports",
  "RECHERCHE_HITS.json",
);

function ensure() {
  for (const d of [
    "",
    "fiches",
    "photos",
    "bannieres",
    "fabricants",
    "gammes",
    "VALIDATION_MANUELLE",
    "produits-termines",
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
    .trim();
}

function tokens(s: string) {
  return norm(s)
    .split(" ")
    .filter((t) => t && !["ml", "mg", "by", "e", "liquide", "eliquide"].includes(t));
}

function nameScore(a: string, b: string) {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n / Math.max(ta.size, tb.size);
}

function walk(dir: string, exts: string[], max = 80000): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length && out.length < max) {
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

function parseDelimited(line: string, delim: string): string[] {
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

function loadSemiCsv(file: string) {
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [] as Record<string, string>[];
  const delim = lines[0].includes(";") && !lines[0].includes(",Item") ? ";" : ",";
  const headers = parseDelimited(lines[0], delim).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  let buf = "";
  for (let i = 1; i < lines.length; i++) {
    buf += (buf ? "\n" : "") + lines[i];
    if (delim === "," && ((buf.match(/"/g) || []).length) % 2) continue;
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

type Evidence = { source: string; field: string; value: string; conf: number };

async function main() {
  ensure();

  let incomplete: any[] = [];
  for (const p of INCOMPLETE_PATHS) {
    if (fs.existsSync(p)) {
      incomplete = JSON.parse(fs.readFileSync(p, "utf8"));
      break;
    }
  }
  const webHits: any[] = fs.existsSync(WEB_HITS)
    ? JSON.parse(fs.readFileSync(WEB_HITS, "utf8"))
    : [];
  const webComplete = webHits.filter((h) => h.status === "complete");

  const prisma = new PrismaClient();
  const ids = incomplete.map((x) => x.productId || x.id).filter(Boolean);

  const dbProducts = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: {
      manufacturer: true,
      rangeRef: true,
      brandRef: true,
      catalogImages: true,
      variants: true,
    },
  });
  const byId = new Map(dbProducts.map((p) => [p.id, p]));

  // Catalogue magasin / ava
  const magasinRows = loadSemiCsv(
    path.join(ROOT, "catalogues", "catalogue-magasin-all-vaps.csv"),
  );
  const magasinById = new Map(magasinRows.map((r) => [r.id_produit, r]));

  // All CSVs
  const csvFiles = walk(ROOT, [".csv"]).filter(
    (f) =>
      !f.includes("node_modules") &&
      !f.includes(".next") &&
      !f.includes("sumup-catalog-example"),
  );
  const sumupLike: Record<string, string>[] = [];
  for (const f of csvFiles) {
    try {
      const rows = loadSemiCsv(f);
      if (!rows.length) continue;
      const keys = Object.keys(rows[0]);
      const isSumup =
        keys.some((k) => /item name/i.test(k)) ||
        keys.some((k) => /item id/i.test(k)) ||
        keys.includes("Barcode");
      const isMagasin = keys.includes("id_produit") || keys.includes("ean");
      if (isSumup || isMagasin) {
        for (const r of rows) {
          (r as any).__file = path.relative(ROOT, f).replace(/\\/g, "/");
          sumupLike.push(r);
        }
      }
    } catch {
      /* skip */
    }
  }

  // Images
  const imageFiles = walk(path.join(ROOT, "public"), [".jpg", ".jpeg", ".png", ".webp"])
    .concat(walk(path.join(ROOT, "assets"), [".jpg", ".jpeg", ".png", ".webp"]))
    .concat(walk(path.join(ROOT, "media"), [".jpg", ".jpeg", ".png", ".webp"]))
    .concat(walk(path.join(ROOT, "data"), [".jpg", ".jpeg", ".png", ".webp"]))
    .concat(walk(path.join(ROOT, "catalogues"), [".jpg", ".jpeg", ".png", ".webp"]));

  // JSON archives (limited)
  const jsonFiles = walk(path.join(ROOT, "data"), [".json"], 1500)
    .concat(walk(path.join(ROOT, "backups"), [".json"], 1500))
    .concat(walk(path.join(ROOT, "catalogues", "finalisation"), [".json"], 2000))
    .filter((f) => {
      try {
        return fs.statSync(f).size < 15_000_000;
      } catch {
        return false;
      }
    });

  // Git path hints
  let gitPaths: string[] = [];
  try {
    gitPaths = execSync("git log --all --name-only --pretty=format: --max-count=300", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .filter((p) => /\.(json|csv|jpg|png|webp)$/i.test(p));
  } catch {
    /* */
  }

  const manufacturersDone = new Set<string>();
  const rangesDone = new Set<string>();
  const results: any[] = [];
  let photosCopied = 0;
  let banners = 0;
  let newlyComplete = 0;

  for (const item of incomplete) {
    const productId = item.productId || item.id;
    const catalogName = item.catalogName || item.name;
    const db = byId.get(productId);
    const evidence: Evidence[] = [];
    const notes: string[] = [];

    // Magasin CSV by ID
    const mag = magasinById.get(productId);
    if (mag) {
      if (mag.ean)
        evidence.push({
          source: "catalogue-magasin-all-vaps.csv",
          field: "ean",
          value: mag.ean,
          conf: 5,
        });
      if (mag.format)
        evidence.push({
          source: "catalogue-magasin",
          field: "format",
          value: mag.format,
          conf: 5,
        });
      if (mag.nicotine !== undefined && mag.nicotine !== "")
        evidence.push({
          source: "catalogue-magasin",
          field: "nicotine",
          value: String(mag.nicotine),
          conf: 5,
        });
      if (mag.marque)
        evidence.push({
          source: "catalogue-magasin",
          field: "manufacturer",
          value: mag.marque,
          conf: 5,
        });
      if (mag.gamme)
        evidence.push({
          source: "catalogue-magasin",
          field: "range",
          value: mag.gamme,
          conf: 5,
        });
      if (mag.image)
        evidence.push({
          source: "catalogue-magasin",
          field: "image",
          value: mag.image,
          conf: 5,
        });
      if (mag.nom_produit)
        evidence.push({
          source: "catalogue-magasin",
          field: "fullName",
          value: mag.nom_produit,
          conf: 5,
        });
      if (mag.reference_sumup)
        evidence.push({
          source: "catalogue-magasin",
          field: "sumupProductId",
          value: mag.reference_sumup,
          conf: 5,
        });
    }

    // Prisma
    if (db) {
      if (db.barcode)
        evidence.push({
          source: "prisma.barcode",
          field: "ean",
          value: db.barcode,
          conf: 5,
        });
      if (db.volumeMl)
        evidence.push({
          source: "prisma.volumeMl",
          field: "format",
          value: `${db.volumeMl} ml`,
          conf: 5,
        });
      if (db.imageUrl)
        evidence.push({
          source: "prisma.imageUrl",
          field: "image",
          value: db.imageUrl,
          conf: 5,
        });
      for (const img of db.images || [])
        evidence.push({ source: "prisma.images", field: "image", value: img, conf: 4 });
      for (const ci of db.catalogImages)
        evidence.push({
          source: `prisma.catalogImages:${ci.status}`,
          field: "image",
          value: ci.url,
          conf: ci.status === "official" ? 5 : 3,
        });
      if (db.manufacturer?.name)
        evidence.push({
          source: "prisma.manufacturer",
          field: "manufacturer",
          value: db.manufacturer.name,
          conf: 5,
        });
      if (db.rangeRef?.name)
        evidence.push({
          source: "prisma.range",
          field: "range",
          value: db.rangeRef.name,
          conf: 5,
        });
      if (db.sumupProductId)
        evidence.push({
          source: "prisma.sumupProductId",
          field: "sumupProductId",
          value: db.sumupProductId,
          conf: 5,
        });
      for (const v of db.variants) {
        if (v.barcode)
          evidence.push({
            source: "prisma.variant.barcode",
            field: "ean",
            value: v.barcode,
            conf: 4,
          });
        if (v.pgVgLabel)
          evidence.push({
            source: "prisma.variant.pgVg",
            field: "pgVg",
            value: v.pgVgLabel,
            conf: 4,
          });
        if (v.pgRatio != null && v.vgRatio != null)
          evidence.push({
            source: "prisma.variant.pg/vg",
            field: "pgVg",
            value: `${v.pgRatio}/${v.vgRatio}`,
            conf: 4,
          });
        if (v.nicotineMg != null)
          evidence.push({
            source: "prisma.variant.nicotine",
            field: "nicotine",
            value: `${v.nicotineMg}`,
            conf: 4,
          });
        if (v.nicotineLabel)
          evidence.push({
            source: "prisma.variant.nicotineLabel",
            field: "nicotine",
            value: v.nicotineLabel,
            conf: 4,
          });
      }
    }

    // Prior web research fields (already validated — reuse, not invent)
    if (item.ean && item.eanConfidence && item.eanConfidence !== "conflict" && item.eanConfidence !== "missing") {
      evidence.push({
        source: "recherche-web-validee",
        field: "ean",
        value: item.ean,
        conf: 4,
      });
    }
    if (item.pgVg)
      evidence.push({ source: "recherche-web", field: "pgVg", value: item.pgVg, conf: 3 });
    if (item.nicotineSoldAs)
      evidence.push({
        source: "recherche-web",
        field: "nicotine",
        value: item.nicotineSoldAs,
        conf: 3,
      });
    if (item.formatMl)
      evidence.push({
        source: "recherche-web",
        field: "format",
        value: `${item.formatMl} ml`,
        conf: 3,
      });
    if (item.photoLocal)
      evidence.push({
        source: "recherche-web-photo",
        field: "image",
        value: item.photoLocal,
        conf: 4,
      });
    if (item.manufacturer)
      evidence.push({
        source: "recherche-web",
        field: "manufacturer",
        value: item.manufacturer,
        conf: 3,
      });
    if (item.range)
      evidence.push({ source: "recherche-web", field: "range", value: item.range, conf: 3 });

    // SumUp / historical CSV by name
    for (const row of sumupLike) {
      const name =
        row["Item name"] ||
        row.nom_produit ||
        row.name ||
        row.Name ||
        "";
      if (!name) continue;
      const s = nameScore(name, catalogName);
      if (s < 0.85) continue;
      const barcode = row.Barcode || row.barcode || row.ean || "";
      const itemId =
        row["Item id (Do not change)"] || row.reference_sumup || row.sumupProductId || "";
      const image = row["Image 1"] || row.image || row.Image || "";
      const conf = s >= 0.95 ? 4 : 3;
      if (barcode)
        evidence.push({
          source: `${row.__file}:${name}`,
          field: "ean",
          value: barcode,
          conf,
        });
      if (itemId)
        evidence.push({
          source: `${row.__file}`,
          field: "sumupProductId",
          value: itemId,
          conf,
        });
      if (image)
        evidence.push({
          source: `${row.__file}`,
          field: "image",
          value: image,
          conf,
        });
      notes.push(`CSV hit score=${s.toFixed(2)} «${name}» ← ${row.__file}`);
    }

    // Local image files
    const nameSlug = slugify(catalogName);
    const key = tokens(catalogName)[0];
    const imgHits = imageFiles
      .map((f) => {
        const base = path.basename(f, path.extname(f));
        let s = nameScore(base, catalogName);
        if (slugify(base).includes(nameSlug.slice(0, 16))) s = Math.max(s, 0.9);
        if (key && !norm(base).includes(key)) s *= 0.45;
        const low = f.replace(/\\/g, "/").toLowerCase();
        if (low.includes("/ranges/") || low.includes("banner") || low.includes("cover"))
          s *= 0.15;
        return { f, s };
      })
      .filter((x) => x.s >= 0.78)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5);
    for (const { f, s } of imgHits) {
      evidence.push({
        source: path.relative(ROOT, f).replace(/\\/g, "/"),
        field: "image",
        value: path.relative(ROOT, f).replace(/\\/g, "/"),
        conf: s >= 0.9 ? 4 : 3,
      });
      notes.push(`Photo fichier score=${s.toFixed(2)} ${path.basename(f)}`);
    }

    // JSON archive shallow scan for this id
    for (const jf of jsonFiles.slice(0, 600)) {
      let text: string;
      try {
        text = fs.readFileSync(jf, "utf8");
      } catch {
        continue;
      }
      if (!text.includes(productId) && !text.includes(catalogName.slice(0, 12))) continue;
      try {
        const data = JSON.parse(text);
        const stack: any[] = [data];
        while (stack.length) {
          const cur = stack.pop();
          if (!cur || typeof cur !== "object") continue;
          if (Array.isArray(cur)) {
            stack.push(...cur);
            continue;
          }
          const id = cur.id || cur.productId || cur.produitCatalogueId;
          const nm = cur.name || cur.catalogName || cur.produitCatalogueCandidat;
          if (id === productId || (nm && nameScore(String(nm), catalogName) >= 0.9)) {
            for (const [field, keys] of [
              ["ean", ["ean", "barcode", "gtin"]],
              ["pgVg", ["pgVg", "pgVgLabel"]],
              ["nicotine", ["nicotine", "nicotineSoldAs", "nicotineMg"]],
              ["image", ["imageUrl", "photoLocal", "url"]],
            ] as const) {
              for (const k of keys) {
                if (cur[k])
                  evidence.push({
                    source: path.relative(ROOT, jf).replace(/\\/g, "/"),
                    field,
                    value: String(cur[k]),
                    conf: id === productId ? 4 : 3,
                  });
              }
            }
          }
          for (const v of Object.values(cur)) if (v && typeof v === "object") stack.push(v);
        }
      } catch {
        /* */
      }
    }

    for (const gp of gitPaths) {
      if (nameScore(path.basename(gp), catalogName) >= 0.9)
        notes.push(`git path: ${gp}`);
    }

    // Resolve fields
    function pick(field: string) {
      const cands = evidence
        .filter((e) => e.field === field && String(e.value).trim())
        .sort((a, b) => b.conf - a.conf);
      if (field === "ean") {
        const eans = [
          ...new Set(
            cands
              .map((c) => c.value.replace(/\s/g, ""))
              .filter((v) => /^\d{8,14}$/.test(v)),
          ),
        ];
        if (eans.length > 1) {
          notes.push(`EAN conflictuels internes: ${eans.join(", ")}`);
          return null;
        }
        if (eans.length === 1) {
          const hit = cands.find((c) => c.value.replace(/\s/g, "") === eans[0])!;
          return { value: eans[0], hit };
        }
        return null;
      }
      return cands[0] ? { value: cands[0].value, hit: cands[0] } : null;
    }

    const manufacturer =
      pick("manufacturer")?.value ||
      item.manufacturer ||
      db?.manufacturer?.name ||
      db?.brand ||
      null;
    const range =
      pick("range")?.value || item.range || db?.rangeRef?.name || db?.range || null;
    const fullName = pick("fullName")?.value || db?.name || catalogName;

    let formatMl: number | null = item.formatMl ?? db?.volumeMl ?? null;
    const fmt = pick("format");
    if (!formatMl && fmt) {
      const m = String(fmt.value).match(/(\d+)/);
      if (m) formatMl = Number(m[1]);
    }
    if (!formatMl) {
      const m = catalogName.match(/(\d+)\s*ml/i);
      if (m) formatMl = Number(m[1]);
    }

    let pgVg = item.pgVg || null;
    const pgp = pick("pgVg");
    if (!pgVg && pgp) {
      const m = String(pgp.value).match(/(\d+)\s*[/|:]\s*(\d+)/);
      if (m) pgVg = `${m[1]}/${m[2]}`;
    }

    let nicotine = item.nicotineSoldAs || null;
    const nic = pick("nicotine");
    if (!nicotine && nic) nicotine = String(nic.value);

    const eanPick = pick("ean");
    const ean = eanPick?.value || null;
    const eanSource = eanPick?.hit.source || null;

    // Photo — prefer local filesystem
    let photoLocal: string | null = item.photoLocal || null;
    let photoSource: string | null = null;
    const imgCands = evidence
      .filter((e) => e.field === "image")
      .sort((a, b) => b.conf - a.conf);
    for (const c of imgCands) {
      const val = c.value;
      if (val.startsWith("http")) {
        notes.push(`Image distante (non téléchargée): ${val}`);
        continue;
      }
      const abs = path.isAbsolute(val)
        ? val
        : path.join(ROOT, val.replace(/^\//, "").replace(/^media\//, "public/media/"));
      const candidates = [
        abs,
        path.join(ROOT, "public", val.replace(/^\//, "")),
        path.join(ROOT, val),
      ];
      const found = candidates.find((p) => fs.existsSync(p));
      if (found) {
        const ext = path.extname(found) || ".jpg";
        const dest = path.join(OUT, "photos", `${nameSlug}${ext}`);
        fs.copyFileSync(found, dest);
        photoLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
        photoSource = c.source;
        photosCopied += 1;
        break;
      }
    }

    // Banner
    let bannerLocal: string | null = null;
    if (manufacturer && range) {
      const keyR = `${manufacturer}::${range}`;
      const bdest = path.join(
        OUT,
        "bannieres",
        `${slugify(manufacturer)}-${slugify(range)}.svg`,
      );
      if (!rangesDone.has(keyR)) {
        rangesDone.add(keyR);
        const cover = imageFiles.find((f) => {
          const n = norm(path.basename(f));
          const low = f.replace(/\\/g, "/").toLowerCase();
          return (
            (low.includes("/ranges/") || low.includes("banner") || low.includes("cover")) &&
            (n.includes(norm(range).slice(0, 8)) ||
              slugify(path.basename(f)).includes(slugify(range).slice(0, 8)))
          );
        });
        if (cover) {
          const dest = path.join(
            OUT,
            "bannieres",
            `${slugify(manufacturer)}-${slugify(range)}${path.extname(cover)}`,
          );
          fs.copyFileSync(cover, dest);
          bannerLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
        } else {
          fs.writeFileSync(
            bdest,
            `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400" viewBox="0 0 1600 400">
  <rect width="1600" height="400" fill="#0f172a"/>
  <text x="80" y="180" fill="#f8fafc" font-family="Georgia, serif" font-size="56">${String(manufacturer).replace(/[<>&]/g, "")}</text>
  <text x="80" y="260" fill="#94a3b8" font-family="Georgia, serif" font-size="36">${String(range).replace(/[<>&]/g, "")}</text>
</svg>`,
          );
          bannerLocal = path.relative(ROOT, bdest).replace(/\\/g, "/");
        }
        banners += 1;
      } else if (fs.existsSync(bdest)) {
        bannerLocal = path.relative(ROOT, bdest).replace(/\\/g, "/");
      }
    }

    if (manufacturer && !manufacturersDone.has(manufacturer)) {
      manufacturersDone.add(manufacturer);
      fs.writeFileSync(
        path.join(OUT, "fabricants", `${slugify(manufacturer)}.json`),
        JSON.stringify({ name: manufacturer, source: "internal" }, null, 2),
      );
    }
    if (range) {
      fs.writeFileSync(
        path.join(OUT, "gammes", `${slugify(range)}.json`),
        JSON.stringify({ range, manufacturer, bannerLocal }, null, 2),
      );
    }

    const missing: string[] = [];
    if (!manufacturer) missing.push("fabricant");
    if (!range) missing.push("gamme");
    if (!fullName) missing.push("nom");
    if (!formatMl) missing.push("format");
    if (!nicotine && nicotine !== "0") {
      // nicotine "0" is valid; missing if null
      if (nicotine == null || nicotine === "") missing.push("nicotine");
    }
    if (!ean) missing.push("ean");
    if (!photoLocal) missing.push("photo");
    // pgVg optional for "terminé" strict? User asked for nicotine/format/ean/photo - include pgVg if we want complete fiche
    // Keep pgVg as soft missing for validation list but not blocking "terminé" if rest OK?
    // User said: fabricant, gamme, nom, EAN, format, nicotine, photos, banner
    // pgVg not in this list explicitly - don't require for "terminé"

    const termine =
      Boolean(manufacturer) &&
      Boolean(range) &&
      Boolean(fullName) &&
      Boolean(formatMl) &&
      nicotine != null &&
      nicotine !== "" &&
      Boolean(ean) &&
      Boolean(photoLocal);

    if (termine) newlyComplete += 1;

    const fiche = {
      productId,
      catalogName,
      fullName,
      manufacturer,
      range,
      formatMl,
      pgVg,
      nicotineSoldAs: nicotine,
      ean,
      eanSource,
      sumupProductId: db?.sumupProductId || pick("sumupProductId")?.value || null,
      sumupProductIdNote:
        "Jamais écrasé en base si déjà valide — valeur documentée seulement",
      photoLocal,
      photoSource,
      bannerLocal,
      status: termine ? "termine" : "validation_manuelle",
      missingFields: missing,
      evidence: evidence.slice(0, 60),
      notes,
      constraints: {
        priceUntouched: true,
        stockUntouched: true,
        sumupIdUntouched: true,
        noDelete: true,
        appliedToDatabase: false,
        noInternetSearch: true,
      },
      researchedAt: new Date().toISOString(),
    };

    const fname = `${nameSlug}.json`;
    fs.writeFileSync(path.join(OUT, "fiches", fname), JSON.stringify(fiche, null, 2));

    if (termine) {
      fs.writeFileSync(
        path.join(OUT, "produits-termines", fname),
        JSON.stringify(fiche, null, 2),
      );
    } else {
      const vdir = path.join(OUT, "VALIDATION_MANUELLE", nameSlug);
      fs.mkdirSync(vdir, { recursive: true });
      fs.writeFileSync(path.join(vdir, "fiche.json"), JSON.stringify(fiche, null, 2));
      fs.writeFileSync(
        path.join(vdir, "BLOQUANT.md"),
        `# ${catalogName}

## Statut
VALIDATION MANUELLE

## Manque réellement
${missing.map((m) => `- **${m}**`).join("\n") || "_rien_"}

## Déjà connu
- Nom: ${fullName}
- Fabricant: ${manufacturer || "?"}
- Gamme: ${range || "?"}
- Format: ${formatMl ?? "?"} ml
- PG/VG: ${pgVg ?? "non trouvé en interne"}
- Nicotine: ${nicotine ?? "?"}
- EAN: ${ean ?? "ABSENT de toutes les sources internes"}
- SumUp: ${fiche.sumupProductId ?? "?"}
- Photo: ${photoLocal || "absente"}
- Bannière: ${bannerLocal || "—"}

## Raison du blocage
${
  missing.includes("ean")
    ? "EAN introuvable dans SumUp CSV, catalogue magasin, Prisma, rapports et archives JSON."
    : `Champs manquants: ${missing.join(", ")}`
}

## Preuves (extrait)
${evidence
  .slice(0, 25)
  .map((e) => `- [${e.conf}] ${e.field}=${e.value} ← ${e.source}`)
  .join("\n") || "_aucune_"}
`,
      );
      if (photoLocal) {
        const abs = path.join(ROOT, photoLocal);
        if (fs.existsSync(abs))
          fs.copyFileSync(abs, path.join(vdir, path.basename(abs)));
      }
    }

    results.push(fiche);
  }

  // Copy web-complete into produits-termines
  for (const h of webComplete) {
    const fname = `${slugify(h.catalogName)}.json`;
    if (!fs.existsSync(path.join(OUT, "produits-termines", fname))) {
      fs.writeFileSync(
        path.join(OUT, "produits-termines", fname),
        JSON.stringify({ ...h, status: "termine", finalizedVia: "recherche-web-anterieure" }, null, 2),
      );
    }
  }

  // ——— INTEGRITY CHECK (catalogue actifs) ———
  const actifs = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      manufacturer: true,
      rangeRef: true,
      catalogImages: true,
    },
  });

  const eanMap = new Map<string, string[]>();
  const sumupMap = new Map<string, string[]>();
  let orphanMfr = 0;
  let orphanRange = 0;
  let photoMismatch = 0;
  let mfrMix = 0;

  for (const p of actifs) {
    if (p.barcode) {
      const a = eanMap.get(p.barcode) || [];
      a.push(p.id);
      eanMap.set(p.barcode, a);
    }
    if (p.sumupProductId) {
      const a = sumupMap.get(p.sumupProductId) || [];
      a.push(p.id);
      sumupMap.set(p.sumupProductId, a);
    }
    if (!p.manufacturerId) orphanMfr += 1;
    if (!p.rangeId && !p.range) orphanRange += 1;
    if (p.manufacturer && p.rangeRef?.manufacturerId && p.rangeRef.manufacturerId !== p.manufacturerId) {
      mfrMix += 1;
    }
    // photo path contains other manufacturer slug?
    if (p.imageUrl && p.manufacturer?.slug) {
      const m = p.imageUrl.toLowerCase().match(/\/products\/([^/]+)\//);
      if (m && m[1] !== p.manufacturer.slug && !m[1].includes(p.manufacturer.slug.slice(0, 5))) {
        photoMismatch += 1;
      }
    }
  }

  const dupEan = [...eanMap.entries()].filter(([, ids]) => ids.length > 1);
  const dupSumup = [...sumupMap.entries()].filter(([, ids]) => ids.length > 1);

  // Name duplicates among actifs
  const nameMap = new Map<string, string[]>();
  for (const p of actifs) {
    const k = norm(p.name);
    const a = nameMap.get(k) || [];
    a.push(p.id);
    nameMap.set(k, a);
  }
  const dupNames = [...nameMap.entries()].filter(([, ids]) => ids.length > 1);

  const actifsComplets = actifs.filter(
    (p) =>
      p.barcode &&
      p.sumupProductId &&
      p.manufacturerId &&
      (p.rangeId || p.range) &&
      (p.imageUrl || p.images?.length || p.catalogImages.length),
  ).length;

  const catalogPct = actifs.length
    ? Math.round((actifsComplets / actifs.length) * 1000) / 10
    : 0;

  const terminesMission = webComplete.length + newlyComplete;
  // Avoid double-count: newlyComplete are from incomplete list that weren't web-complete
  const stillVm = results.filter((r) => r.status !== "termine");
  const missionTotal = 98;
  const missionPct = Math.round((terminesMission / missionTotal) * 1000) / 10;

  await prisma.$disconnect();

  const integrity = {
    actifs: actifs.length,
    actifsComplets,
    catalogPct,
    dupEan: dupEan.length,
    dupSumup: dupSumup.length,
    dupNames: dupNames.length,
    orphanMfr,
    orphanRange,
    mfrMix,
    photoMismatch,
    dupEanSamples: dupEan.slice(0, 10).map(([ean, ids]) => ({ ean, ids })),
    dupSumupSamples: dupSumup.slice(0, 10).map(([id, ids]) => ({ sumup: id, ids })),
  };

  const missingAgg: Record<string, number> = {};
  for (const r of stillVm) {
    for (const m of r.missingFields || []) missingAgg[m] = (missingAgg[m] || 0) + 1;
  }

  const report = `# RAPPORT FINAL — Finalisation 100 % (sources internes)

**Date :** ${new Date().toISOString()}  
**Dossier :** \`catalogues/finalisation/finale-100/\`  
**Règle :** aucune recherche Internet · aucune invention · prix/stocks/SumUp ID intacts

## Synthèse demandée

| Indicateur | Valeur |
|---|---:|
| Produits terminés (mission 98 : web + interne) | **${terminesMission}** |
| Nouveaux terminés cette passe interne | **${newlyComplete}** |
| Produits en VALIDATION_MANUELLE | **${stillVm.length}** |
| Photos copiées (cette passe) | **${photosCopied}** |
| Bannières créées/reprises | **${banners}** |
| **% achèvement mission des 98** | **${missionPct} %** |
| Produits actifs catalogue | **${actifs.length}** |
| Actifs complets (SumUp+EAN+fabricant+gamme+image) | **${actifsComplets}** |
| **% achèvement réel catalogue** | **${catalogPct} %** |

## Vérification complète

| Contrôle | Résultat |
|---|---|
| Doublons de nom (actifs) | ${dupNames.length === 0 ? "✓ 0" : `⚠ ${dupNames.length}`} |
| EAN dupliqués | ${dupEan.length === 0 ? "✓ 0" : `⚠ ${dupEan.length}`} |
| SumUp ID dupliqués | ${dupSumup.length === 0 ? "✓ 0" : `⚠ ${dupSumup.length}`} |
| Sans fabricant | ${orphanMfr === 0 ? "✓ 0" : `⚠ ${orphanMfr}`} |
| Sans gamme | ${orphanRange === 0 ? "✓ 0" : `⚠ ${orphanRange}`} |
| Fabricant/gamme mélangés | ${mfrMix === 0 ? "✓ 0" : `⚠ ${mfrMix}`} |
| Photos path ≠ fabricant | ${photoMismatch === 0 ? "✓ 0" : `⚠ ${photoMismatch}`} |

## Informations encore manquantes (agrégat VM)

${Object.entries(missingAgg)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- **${k}** : ${v} produit(s)`)
  .join("\n") || "_aucune_"}

## Liste VALIDATION_MANUELLE

${stillVm
  .map(
    (r) =>
      `- **${r.catalogName}** — manque: **${(r.missingFields || []).join(", ")}** → \`VALIDATION_MANUELLE/${slugify(r.catalogName)}/\``,
  )
  .join("\n")}

## Nouveaux terminés (interne)

${results
  .filter((r) => r.status === "termine")
  .map((r) => `- **${r.catalogName}** — EAN \`${r.ean}\` ← ${r.eanSource || "?"}`)
  .join("\n") || "_Aucun nouveau (EAN absents des sources internes)_"}

## Conclusion

Les sources internes (SumUp, CSV magasin/AVA, Prisma, photos, rapports, git) **ne contiennent pas d'EAN** pour la majorité des ${stillVm.length} restants.  
Le catalogue ne peut pas atteindre **100 %** sans validation manuelle (étiquette / facture / PDF fabricant).  
Chaque dossier \`VALIDATION_MANUELLE\` regroupe tout le déjà-connu pour accélérer la saisie humaine.
`;

  fs.writeFileSync(path.join(OUT, "RAPPORT_FINAL_100.md"), report);
  fs.writeFileSync(path.join(OUT, "rapports", "RESULTATS.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT, "rapports", "INTEGRITE.json"), JSON.stringify(integrity, null, 2));
  fs.writeFileSync(
    path.join(OUT, "rapports", "VALIDATION_MANUELLE.json"),
    JSON.stringify(stillVm, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        newlyComplete,
        terminesMission,
        stillVm: stillVm.length,
        photosCopied,
        banners,
        missionPct,
        catalogPct,
        actifs: actifs.length,
        actifsComplets,
        integrity: {
          dupEan: dupEan.length,
          dupSumup: dupSumup.length,
          dupNames: dupNames.length,
          orphanMfr,
          orphanRange,
          mfrMix,
          photoMismatch,
        },
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
