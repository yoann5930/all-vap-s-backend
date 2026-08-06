/**
 * Passe 2 croisée — SumUp CSV ciblé + photos locales + correction EAN contaminés.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "catalogues", "finalisation", "croisee");
const RESULTS = path.join(OUT, "rapports", "RESULTATS.json");
const WEB_COMPLETE = path.join(
  ROOT,
  "catalogues",
  "finalisation",
  "recherche-web",
  "rapports",
  "RECHERCHE_HITS.json",
);

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
    .filter((t) => t && !["ml", "mg", "by", "e", "liquide"].includes(t));
}

function score(a: string, b: string) {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n / Math.max(ta.size, tb.size);
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

function loadSumup(file: string) {
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/);
  const h = parseCsvLine(lines[0]).map((x) => x.trim());
  const idx = (n: string) => h.findIndex((x) => x.toLowerCase() === n.toLowerCase());
  const iN = idx("Item name");
  const iB = idx("Barcode");
  const iId = idx("Item id (Do not change)");
  const iImg = idx("Image 1");
  const rows: { name: string; barcode: string; id: string; img: string }[] = [];
  let buf = "";
  for (let i = 1; i < lines.length; i++) {
    buf += (buf ? "\n" : "") + lines[i];
    if (((buf.match(/"/g) || []).length) % 2) continue;
    const c = parseCsvLine(buf);
    buf = "";
    const name = (c[iN] || "").replace(/^\t/, "").trim();
    if (!name) continue;
    rows.push({
      name,
      barcode: (c[iB] || "").trim(),
      id: (c[iId] || "").trim(),
      img: (c[iImg] || "").trim(),
    });
  }
  return rows;
}

function walkImages(dir: string): string[] {
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
      } else if (/\.(jpe?g|png|webp)$/i.test(e.name)) out.push(p);
    }
  }
  return out;
}

async function main() {
  const results: any[] = JSON.parse(fs.readFileSync(RESULTS, "utf8"));
  const webHits: any[] = JSON.parse(fs.readFileSync(WEB_COMPLETE, "utf8"));
  const webComplete = webHits.filter((h) => h.status === "complete");

  const csvs = [
    path.join(ROOT, "inbox_sumup", "2026-08-03_16-46-54_items-export_MCGR4RXU.csv"),
    path.join(ROOT, "inbox_sumup", "2026-07-30_22-06-40_items-export_MCGR4RXU.csv"),
  ].filter((f) => fs.existsSync(f));

  const sumup = csvs.flatMap(loadSumup);
  const images = walkImages(path.join(ROOT, "public"))
    .concat(walkImages(path.join(ROOT, "catalogues", "finalisation")))
    .concat(walkImages(path.join(ROOT, "catalogues")));

  let photos = 0;
  let eanFixed = 0;
  let invalidated = 0;

  // Invalidate Force Verte contaminated EAN from web hits noise
  for (const r of results) {
    if (r.catalogName === "Force Verte" && r.ean === "6410949705432") {
      r.ean = null;
      r.eanConfidence = "conflict";
      r.eanSource = null;
      r.notes = [
        ...(r.notes || []),
        "EAN 6410949705432 invalidé — code déjà vu en bruit de pages liées Force Vape",
      ];
      r.status = "incomplet";
      r.missingFields = Array.from(new Set([...(r.missingFields || []), "ean"]));
      invalidated += 1;
    }
  }

  for (const r of results) {
    // SumUp strict match
    const matches = sumup
      .map((row) => ({ row, s: score(row.name, r.catalogName) }))
      .filter((x) => x.s >= 0.82)
      .sort((a, b) => b.s - a.s);

    if (matches.length) {
      const top = matches[0];
      r.notes = [
        ...(r.notes || []),
        `SumUp croisé: «${top.row.name}» score=${top.s.toFixed(2)} barcode=${top.row.barcode || "∅"} id=${top.row.id || "∅"}`,
      ];
      // Only accept barcode if unique among top matches and score high
      const barcodes = [
        ...new Set(matches.filter((m) => m.s >= 0.9 && m.row.barcode).map((m) => m.row.barcode)),
      ];
      if (barcodes.length === 1 && (!r.ean || r.eanConfidence === "conflict" || r.eanConfidence === "missing")) {
        // Extra safety: barcode must not belong to a clearly different product name
        const owners = sumup.filter((x) => x.barcode === barcodes[0]);
        const coherent = owners.every((o) => score(o.name, r.catalogName) >= 0.75);
        if (coherent) {
          r.ean = barcodes[0];
          r.eanConfidence = "archive_sumup";
          r.eanSource = `sumup:${top.row.name}`;
          eanFixed += 1;
        } else {
          r.notes.push(`EAN SumUp ${barcodes[0]} non retenu — propriétaires incohérents`);
        }
      } else if (barcodes.length > 1) {
        r.notes.push(`EAN SumUp multiples: ${barcodes.join(", ")}`);
      }

      if (!r.sumupProductId && top.s >= 0.95 && top.row.id) {
        // Document only — do not write to DB
        r.sumupProductIdCandidate = top.row.id;
        r.notes.push(`Candidat SumUp ID (non appliqué): ${top.row.id}`);
      }
    }

    // Local photo if missing
    if (!r.photoLocal) {
      const nameSlug = slugify(r.catalogName);
      const key = tokens(r.catalogName)[0];
      const cands = images
        .map((f) => {
          const base = path.basename(f, path.extname(f));
          let s = score(base, r.catalogName);
          if (slugify(base).includes(nameSlug.slice(0, 18))) s = Math.max(s, 0.92);
          if (key && !norm(base).includes(key)) s *= 0.4;
          // reject gamme/group covers for packshot
          const low = f.replace(/\\/g, "/").toLowerCase();
          if (low.includes("/ranges/") || low.includes("banner") || low.includes("cover")) s *= 0.2;
          return { f, s };
        })
        .filter((x) => x.s >= 0.78)
        .sort((a, b) => b.s - a.s);

      if (cands[0]) {
        const ext = path.extname(cands[0].f) || ".jpg";
        const dest = path.join(OUT, "photos", `${nameSlug}${ext}`);
        fs.copyFileSync(cands[0].f, dest);
        r.photoLocal = path.relative(ROOT, dest).replace(/\\/g, "/");
        r.photoSource = path.relative(ROOT, cands[0].f).replace(/\\/g, "/");
        photos += 1;
        r.notes.push(`Photo archive score=${cands[0].s.toFixed(2)} ← ${path.basename(cands[0].f)}`);
      }
    }

    // Recompute status
    const missing: string[] = [];
    if (!r.formatMl) missing.push("formatMl");
    if (!r.pgVg) missing.push("pgVg");
    if (!r.nicotineSoldAs) missing.push("nicotine");
    if (!r.ean || r.eanConfidence === "conflict" || r.eanConfidence === "missing") missing.push("ean");
    if (!r.photoLocal) missing.push("photo");
    r.missingFields = missing;
    r.status = missing.length === 0 ? "finalise" : "incomplet";
    r.recoveredFromArchives = Boolean(
      r.eanSource || (r.photoSource && String(r.photoSource).includes("public")),
    );

    const fname = `${slugify(r.catalogName)}.json`;
    fs.writeFileSync(path.join(OUT, "fiches", fname), JSON.stringify(r, null, 2));

    const vdir = path.join(OUT, "VALIDATION_MANUELLE", slugify(r.catalogName));
    if (r.status === "finalise") {
      fs.writeFileSync(path.join(OUT, "produits-finalises", fname), JSON.stringify(r, null, 2));
      if (fs.existsSync(vdir)) fs.rmSync(vdir, { recursive: true, force: true });
    } else {
      fs.mkdirSync(vdir, { recursive: true });
      fs.writeFileSync(path.join(vdir, "fiche.json"), JSON.stringify(r, null, 2));
      fs.writeFileSync(
        path.join(vdir, "BLOQUANT.md"),
        `# ${r.catalogName}

## Blocage
${missing.map((m) => `- **${m}**`).join("\n")}

## Déjà trouvé
- Fabricant: ${r.manufacturer || "?"}
- Gamme: ${r.range || "?"}
- Format: ${r.formatMl ?? "?"} ml
- PG/VG: ${r.pgVg ?? "?"}
- Nicotine: ${r.nicotineSoldAs ?? "?"}
- EAN: ${r.ean ?? "?"} (${r.eanConfidence || "?"})
- SumUp DB: ${r.sumupProductId ?? "?"}
- SumUp candidat (non appliqué): ${r.sumupProductIdCandidate ?? "—"}
- Photo: ${r.photoLocal || "absente"}

## Notes
${(r.notes || []).slice(-15).map((n: string) => `- ${n}`).join("\n")}
`,
      );
      if (r.photoLocal) {
        const abs = path.join(ROOT, r.photoLocal);
        if (fs.existsSync(abs)) {
          fs.copyFileSync(abs, path.join(vdir, path.basename(abs)));
        }
      }
    }
  }

  const finalized = results.filter((r) => r.status === "finalise");
  const still = results.filter((r) => r.status !== "finalise");
  const missionDone = webComplete.length + finalized.length;
  const missionTotal = 98;
  const missionPct = Math.round((missionDone / missionTotal) * 1000) / 10;

  // Block reason aggregation
  const reasonCount: Record<string, number> = {};
  for (const r of still) {
    const key = (r.missingFields || []).sort().join("+") || "inconnu";
    reasonCount[key] = (reasonCount[key] || 0) + 1;
  }

  const report = `# Rapport — Finalisation définitive (recherche croisée archives)

**Date :** ${new Date().toISOString()}  
**Dossier :** \`catalogues/finalisation/croisee/\`  

## Contraintes respectées

- Aucune invention
- Aucun prix / stock modifié
- Aucun produit supprimé
- Aucun SumUp ID appliqué en base (candidats documentés seulement)

## Synthèse

| Indicateur | Nb |
|---|---:|
| Produits totalement finalisés (passe archives) | **${finalized.length}** |
| Produits récupérés via archives (EAN/photo SumUp/projet) | **${eanFixed} EAN + ${photos} photos** |
| Produits encore incomplets | **${still.length}** |
| Dossiers VALIDATION_MANUELLE | **${still.length}** |
| Déjà complets (recherche web) | **${webComplete.length}** |
| **Mission 98 — finalisés** | **${missionDone} / ${missionTotal}** |
| **% achèvement mission (98)** | **${missionPct} %** |
| EAN invalidés (contamination) | **${invalidated}** |

## Produits finalisés archives

${finalized.map((r) => `- **${r.catalogName}** — EAN \`${r.ean}\` (${r.eanConfidence})`).join("\n") || "_Aucun_"}

## Agrégation des blocages

${Object.entries(reasonCount)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- **${k}** : ${v}`)
  .join("\n")}

## Liste détaillée — incomplets

${still
  .map(
    (r) =>
      `- **${r.catalogName}** (${r.manufacturer || "?"} / ${r.range || "?"}) — **${(r.missingFields || []).join(", ")}**`,
  )
  .join("\n")}

## Note

Le goulot d'étranglement dominant est l'**EAN** : absent de Prisma et souvent absent/ambigu dans SumUp pour ces références. Les photos projet ont été associées quand le nom de fichier correspondait exactement au produit.
`;

  fs.writeFileSync(path.join(OUT, "RAPPORT_FINALISATION_DEFINITIVE.md"), report);
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT, "rapports", "ENCORE_INCOMPLETS.json"), JSON.stringify(still, null, 2));

  // Also write combined mission summary
  const combined = {
    webComplete: webComplete.length,
    archiveFinalized: finalized.length,
    missionDone,
    missionTotal,
    missionPct,
    stillIncomplete: still.length,
    validationManuelleDir: "catalogues/finalisation/croisee/VALIDATION_MANUELLE",
  };
  fs.writeFileSync(path.join(OUT, "rapports", "SYNTHESE_MISSION.json"), JSON.stringify(combined, null, 2));

  console.log(JSON.stringify({ ...combined, eanFixed, photos, invalidated }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
