/**
 * Matrice complète Yoann : fabricant × gamme × intégration × logo × cover × produits.
 *
 * Usage:
 *   npx tsx scripts/audit-yoann-full-matrix.ts
 *
 * Sorties:
 *   data/catalog/yoann/MATRICE_COMPLETE_YYYY-MM-DD.json
 *   docs/RAPPORT_MATRICE_FABRICANTS_GAMMES.md
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import prisma from "../lib/prisma";
import { manufacturerLogoUrl } from "../lib/catalog/manufacturer-logo";
import { rangeCoverUrl } from "../lib/catalog/range-cover";
import {
  isRangeCatalogEligible,
  readRangeOfficialGate,
} from "../lib/catalog/official-verification";

type YoannRange = { name: string; products?: Array<{ name: string }> };
type YoannMfr = { id: string; name: string; ranges?: YoannRange[] };

type MatrixRow = {
  fabricantDemande: string;
  fabricantSlugJson: string;
  gammeDemandee: string;
  dejaIntegre: boolean;
  correctementIntegre: boolean;
  logoCorrect: "oui" | "non" | "LOGO_A_CONFIRMER" | "ABSENT";
  coverCorrecte: "oui" | "non" | "FAIBLE_CONTRASTE" | "ABSENTE";
  produitsPresents: number;
  produitsJson: number;
  visibleSite: boolean;
  manufacturerDb: string | null;
  rangeDbSlug: string | null;
  action: string;
  notes: string;
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(s: string): string {
  return norm(s).replace(/\s+/g, "-");
}

async function logoQuality(
  slug: string
): Promise<"oui" | "non" | "LOGO_A_CONFIRMER" | "ABSENT"> {
  const url = manufacturerLogoUrl(slug);
  if (!url) return "ABSENT";
  const abs = path.join(process.cwd(), "public", url.replace(/^\//, ""));
  if (!fs.existsSync(abs)) return "ABSENT";

  // Placeholders connus
  if (slug === "vape-47") {
    const bak = path.join(
      process.cwd(),
      "public/media/manufacturers/vape-47/logo.WRONG-prestashop-mystore.webp.bak"
    );
    const current = fs.readFileSync(abs);
    if (fs.existsSync(bak) && Buffer.compare(current, fs.readFileSync(bak)) === 0) {
      return "non";
    }
    // Logo officiel SVG converti : fichier logo.svg présent = confirmé
    if (fs.existsSync(path.join(process.cwd(), "public/media/manufacturers/vape-47/logo.svg"))) {
      return "oui";
    }
  }

  try {
    const meta = await sharp(abs).metadata();
    const size = fs.statSync(abs).size;
    if (size < 800 || (meta.width ?? 0) < 40) return "LOGO_A_CONFIRMER";
    const stats = await sharp(abs).stats();
    const mean =
      (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
    // Quasi noir / quasi blanc uniforme → suspect
    if (mean < 8 || mean > 247) return "LOGO_A_CONFIRMER";
    return "oui";
  } catch {
    return "LOGO_A_CONFIRMER";
  }
}

async function coverQuality(
  mfrSlug: string,
  rangeSlug: string
): Promise<"oui" | "non" | "FAIBLE_CONTRASTE" | "ABSENTE"> {
  const url = rangeCoverUrl(mfrSlug, rangeSlug);
  if (!url) return "ABSENTE";
  const abs = path.join(process.cwd(), "public", url.replace(/^\//, ""));
  if (!fs.existsSync(abs)) return "ABSENTE";
  try {
    const size = fs.statSync(abs).size;
    const stats = await sharp(abs).stats();
    const mean =
      (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
    if (size < 3000 || mean < 12) return "FAIBLE_CONTRASTE";
    return "oui";
  } catch {
    return "non";
  }
}

async function main() {
  const yoannPath = path.resolve("data/catalog/yoann/allvaps_catalogue.json");
  const yoann = JSON.parse(fs.readFileSync(yoannPath, "utf8")) as {
    manufacturers: YoannMfr[];
  };

  const dbMfrs = await prisma.manufacturer.findMany({
    where: { isActive: true },
    include: {
      ranges: {
        where: { isActive: true },
        include: {
          _count: {
            select: {
              products: true,
            },
          },
        },
      },
      products: {
        where: { isActive: true },
        select: { id: true, rangeId: true, visibleOnline: true },
      },
    },
  });

  const bySlug = new Map(dbMfrs.map((m) => [m.slug, m]));
  const byName = new Map(dbMfrs.map((m) => [norm(m.name), m]));

  // Alias JSON id → db slug
  const aliases: Record<string, string> = {
    etasty: "e-tasty",
    "e-tasty": "e-tasty",
    "big-kawa": "liquide-lab", // Big Kawa est une gamme Liquide Lab dans le JSON Yoann
  };

  const rows: MatrixRow[] = [];

  for (const jm of yoann.manufacturers) {
    const slugHint = aliases[jm.id] || jm.id;
    const db =
      bySlug.get(slugHint) ||
      bySlug.get(slugify(jm.name)) ||
      byName.get(norm(jm.name)) ||
      null;

    for (const jr of jm.ranges || []) {
      const jsonProducts = (jr.products || []).length;
      let rangeDb =
        db?.ranges.find((r) => r.slug === slugify(jr.name)) ||
        db?.ranges.find((r) => r.slug === `${slugify(jr.name)}-${slugHint}`) ||
        db?.ranges.find((r) => norm(r.name) === norm(jr.name)) ||
        null;

      // Correspondances Yoann ↔ slugs DB connus
      if (!rangeDb && db) {
        const map: Record<string, string> = {
          enfer: "enfer",
          "les fruits d enfer": "les-fruits-d-enfer",
          "furiosa eggz v2": "furiosa-eggz",
          "furiosa eggz": "furiosa-eggz",
        };
        const key = norm(jr.name);
        const mapped = map[key];
        if (mapped) rangeDb = db.ranges.find((r) => r.slug === mapped) || null;
      }

      // Cas Big Kawa listé comme fabricant dans JSON
      if (!rangeDb && jm.id === "big-kawa") {
        const ll = bySlug.get("liquide-lab");
        rangeDb = ll?.ranges.find((r) => norm(r.name).includes("big kawa")) || null;
      }

      const mfrSlugForAssets = rangeDb
        ? dbMfrs.find((m) => m.ranges.some((r) => r.id === rangeDb!.id))?.slug ||
          db?.slug ||
          slugHint
        : db?.slug || slugHint;

      const logo = await logoQuality(mfrSlugForAssets);
      const cover = rangeDb
        ? await coverQuality(mfrSlugForAssets, rangeDb.slug)
        : "ABSENTE";

      const productCount = rangeDb
        ? await prisma.product.count({
            where: {
              rangeId: rangeDb.id,
              isActive: true,
            },
          })
        : 0;

      const visibleCount = rangeDb
        ? await prisma.product.count({
            where: {
              rangeId: rangeDb.id,
              isActive: true,
              visibleOnline: true,
            },
          })
        : 0;

      const gate = rangeDb
        ? readRangeOfficialGate(rangeDb as unknown as Record<string, unknown>)
        : null;
      const eligible = gate
        ? isRangeCatalogEligible({
            verificationStatus: gate.verificationStatus,
            catalogVisible: gate.catalogVisible,
            isActive: gate.isActive,
            legacyStatus: gate.legacyStatus,
          })
        : false;

      const dejaIntegre = Boolean(db && rangeDb);
      const correctementIntegre =
        dejaIntegre &&
        logo === "oui" &&
        (cover === "oui" || productCount === 0) &&
        (jsonProducts === 0 || productCount > 0);

      const visibleSite = Boolean(eligible && logo === "oui" && cover !== "ABSENTE");

      let action = "OK — ne pas recréer";
      const notes: string[] = [];

      if (!db) {
        action = "AJOUTER fabricant (après confirmation officielle)";
        notes.push("Fabricant absent DB");
      } else if (!rangeDb) {
        action = "AJOUTER ou RATTACHER gamme";
        notes.push("Gamme absente sous ce fabricant");
      } else if (logo === "ABSENT") {
        action = "LOGO_A_CONFIRMER — fournir logo officiel Yoann";
      } else if (logo === "LOGO_A_CONFIRMER" || logo === "non") {
        action = "CORRIGER logo fabricant";
      } else if (cover === "ABSENTE" && eligible) {
        action = "AJOUTER cover gamme (obligatoire si publiée)";
      } else if (cover === "FAIBLE_CONTRASTE") {
        action = "AMÉLIORER cover (contraste / lisibilité)";
      } else if (jsonProducts > 0 && productCount === 0) {
        action = "COMPLÉTER produits (JSON a des refs, DB vide)";
      } else if (productCount > 0 && visibleCount === 0) {
        action = "CORRIGER visibilité site (produits présents mais invisibles)";
        notes.push(`${productCount} produits, 0 visibleOnline`);
      } else if (!correctementIntegre) {
        action = "COMPLÉTER intégration partielle";
      }

      if (jm.id === "vape-47" && /enfer/i.test(jr.name)) {
        notes.push("Cover ENFER régénérée (asset officiel trop sombre)");
      }

      rows.push({
        fabricantDemande: jm.name,
        fabricantSlugJson: jm.id,
        gammeDemandee: jr.name,
        dejaIntegre,
        correctementIntegre,
        logoCorrect: logo,
        coverCorrecte: cover,
        produitsPresents: productCount,
        produitsJson: jsonProducts,
        visibleSite,
        manufacturerDb: db?.name ?? null,
        rangeDbSlug: rangeDb?.slug ?? null,
        action,
        notes: notes.join(" ; "),
      });
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const outJson = path.resolve(`data/catalog/yoann/MATRICE_COMPLETE_${stamp}.json`);
  const summary = {
    generatedAt: new Date().toISOString(),
    yoannManufacturers: yoann.manufacturers.length,
    yoannRanges: rows.length,
    dejaIntegre: rows.filter((r) => r.dejaIntegre).length,
    correctementIntegre: rows.filter((r) => r.correctementIntegre).length,
    logoOk: rows.filter((r) => r.logoCorrect === "oui").length,
    logoAbsent: rows.filter((r) => r.logoCorrect === "ABSENT").length,
    logoAConfirmer: rows.filter((r) => r.logoCorrect === "LOGO_A_CONFIRMER").length,
    coverOk: rows.filter((r) => r.coverCorrecte === "oui").length,
    coverFaible: rows.filter((r) => r.coverCorrecte === "FAIBLE_CONTRASTE").length,
    coverAbsente: rows.filter((r) => r.coverCorrecte === "ABSENTE").length,
    visibleSite: rows.filter((r) => r.visibleSite).length,
    actionsNonOk: rows.filter((r) => !r.action.startsWith("OK")).length,
  };

  fs.writeFileSync(outJson, JSON.stringify({ summary, rows }, null, 2), "utf8");

  const md: string[] = [
    `# Matrice fabricants & gammes (Yoann)`,
    ``,
    `Généré : ${summary.generatedAt}`,
    ``,
    `## Synthèse`,
    ``,
    `| Indicateur | Valeur |`,
    `| --- | ---: |`,
    `| Fabricants Yoann | ${summary.yoannManufacturers} |`,
    `| Gammes Yoann | ${summary.yoannRanges} |`,
    `| Déjà intégrées | ${summary.dejaIntegre} |`,
    `| Correctement intégrées | ${summary.correctementIntegre} |`,
    `| Logo OK | ${summary.logoOk} |`,
    `| Logo ABSENT | ${summary.logoAbsent} |`,
    `| LOGO_A_CONFIRMER | ${summary.logoAConfirmer} |`,
    `| Cover OK | ${summary.coverOk} |`,
    `| Cover faible contraste | ${summary.coverFaible} |`,
    `| Cover absente | ${summary.coverAbsente} |`,
    `| Visibles site (éligible+logo+cover) | ${summary.visibleSite} |`,
    `| Actions restantes | ${summary.actionsNonOk} |`,
    ``,
    `## Vape 47 — correction logo`,
    ``,
    `- Ancien fichier = placeholder PrestaShop « my store » (\`order.vape47.com/img/logo.jpg\`) — **interdit**.`,
    `- Remplacé par logo officiel : \`https://www.vape47.com/icon.svg\` → \`public/media/manufacturers/vape-47/logo.webp\`.`,
    `- Covers ENFER / Les Fruits d'ENFER : asset officiel trop sombre → covers contrastées régénérées.`,
    `- Furiosa Eggz : cover officielle \`vape47.com/images/marques/furiosa-eggz.webp\`.`,
    ``,
    `## Matrice`,
    ``,
    `| Fabricant demandé | Gamme demandée | Déjà intégré | Correctement intégré | Logo | Cover | Produits | Action |`,
    `| --- | --- | ---: | ---: | --- | --- | ---: | --- |`,
  ];

  for (const r of rows) {
    md.push(
      `| ${r.fabricantDemande} | ${r.gammeDemandee} | ${r.dejaIntegre ? "oui" : "non"} | ${
        r.correctementIntegre ? "oui" : "non"
      } | ${r.logoCorrect} | ${r.coverCorrecte} | ${r.produitsPresents}/${r.produitsJson} | ${r.action} |`
    );
  }

  md.push(
    ``,
    `## Demandes Yoann (logos manquants)`,
    ``,
    `Les fabricants sans logo officiel confirmé **n’apparaissent pas** en cases \`/e-liquides\` (règle catalogue).`,
    `Fournir les logos officiels pour : ` +
      [
        ...new Set(
          rows
            .filter((r) => r.logoCorrect === "ABSENT" || r.logoCorrect === "LOGO_A_CONFIRMER")
            .map((r) => r.fabricantDemande)
        ),
      ].join(", ") +
      `.`,
    ``,
    `Source JSON : \`${outJson}\``,
    ``
  );

  const outMd = path.resolve("docs/RAPPORT_MATRICE_FABRICANTS_GAMMES.md");
  fs.writeFileSync(outMd, md.join("\n"), "utf8");

  console.log(JSON.stringify(summary, null, 2));
  console.log("→", outJson);
  console.log("→", outMd);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
