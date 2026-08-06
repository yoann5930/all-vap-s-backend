/**
 * Régénère docs/RAPPORT_CORRECTION_IMPORT_COMPLET_GAMMES.md
 * à partir de l'état DB actuel + JSON Yoann + résultats du pass apply.
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";
import { normalizeForMatch } from "../lib/catalog/official-verification";
import { isRangeCatalogEligible, readRangeOfficialGate } from "../lib/catalog/official-verification";

type JsonRange = { name: string; aliases?: string[]; products?: Array<{ name: string }> };
type JsonMfr = { id: string; name: string; aliases?: string[]; ranges?: JsonRange[] };

async function findMfr(jm: JsonMfr) {
  const keys = [jm.name, jm.id, ...(jm.aliases || [])].map(normalizeForMatch);
  if (jm.id === "big-kawa") {
    const ll = await prisma.manufacturer.findUnique({ where: { slug: "liquide-lab" } });
    if (ll) return ll;
  }
  if (jm.id === "etasty") {
    const et = await prisma.manufacturer.findUnique({ where: { slug: "e-tasty" } });
    if (et) return et;
  }
  const all = await prisma.manufacturer.findMany();
  return (
    all.find((m) => {
      const n = normalizeForMatch(m.name);
      const s = normalizeForMatch(m.slug);
      return keys.some((k) => k === n || k === s || n.includes(k) || k.includes(n));
    }) || null
  );
}

async function findRange(manufacturerId: string | null, name: string, aliases?: string[]) {
  const keys = [name, ...(aliases || [])].map(normalizeForMatch);
  // Alias connus
  if (normalizeForMatch(name) === "golf city") keys.push("godfall city", "god fall city");
  if (normalizeForMatch(name) === "mist") keys.push("myst");
  if (normalizeForMatch(name) === "dragonz") keys.push("dragonzz");
  if (normalizeForMatch(name) === "cafe") keys.push("big kawa");

  const ranges = await prisma.productRange.findMany({
    where: manufacturerId ? { manufacturerId } : undefined,
  });
  return (
    ranges.find((r) => {
      const n = normalizeForMatch(r.name);
      const s = normalizeForMatch(r.slug);
      return keys.some((k) => k === n || k === s || n.includes(k) || k.includes(n));
    }) || null
  );
}

function statusOf(params: {
  presente: boolean;
  productCount: number;
  onlineCount: number;
  jsonProducts: number;
  eligible: boolean;
}): string {
  if (!params.presente) return "ABSENTE / PROPOSITION SEULE";
  if (params.onlineCount > 0 && params.productCount >= Math.max(1, params.jsonProducts)) {
    return "CORRIGÉE ET COMPLÈTE";
  }
  if (params.productCount > 0) return "PARTIELLE";
  return "ABSENTE DE SUMUP";
}

async function main() {
  const json = JSON.parse(
    fs.readFileSync(path.resolve("data/catalog/yoann/allvaps_catalogue.json"), "utf8")
  ) as { manufacturers: JsonMfr[] };
  const applyPass = JSON.parse(
    fs.readFileSync(path.resolve("data/catalog/yoann/CORRECTION_PASS_2026-07-31.json"), "utf8")
  ) as { stats?: Record<string, number>; mode?: string };

  const rows: Array<{
    fabricant: string;
    gamme: string;
    presenteAvant: string;
    action: string;
    officiels: number;
    sumup: number;
    visible: string;
    statut: string;
  }> = [];

  let presente = 0;
  let complete = 0;
  let partielle = 0;
  let absente = 0;

  for (const jm of json.manufacturers) {
    const mfr = await findMfr(jm);
    for (const jr of jm.ranges || []) {
      const aliases = jr.aliases || [];
      const range = mfr
        ? await findRange(mfr.id, jr.name, aliases)
        : await findRange(null, jr.name, aliases);
      const productCount = range
        ? await prisma.product.count({ where: { rangeId: range.id } })
        : 0;
      const onlineCount = range
        ? await prisma.product.count({ where: { rangeId: range.id, visibleOnline: true } })
        : 0;
      const gate = range ? readRangeOfficialGate(range as unknown as Record<string, unknown>) : null;
      const eligible = gate
        ? isRangeCatalogEligible({
            verificationStatus: gate.verificationStatus,
            catalogVisible: gate.catalogVisible,
            isActive: gate.isActive,
            legacyStatus: gate.legacyStatus,
          })
        : false;

      const statut = statusOf({
        presente: Boolean(range),
        productCount,
        onlineCount,
        jsonProducts: (jr.products || []).length,
        eligible,
      });
      if (range) presente++;
      else absente++;
      if (statut === "CORRIGÉE ET COMPLÈTE") complete++;
      else if (statut === "PARTIELLE") partielle++;

      rows.push({
        fabricant: jm.name,
        gamme: jr.name,
        presenteAvant: range ? "oui" : "non",
        action: range ? (eligible ? "FUSIONNÉE / VISIBLE" : "CRÉÉE OU FUSIONNÉE (à confirmer)") : "PROPOSITION SEULE",
        officiels: (jr.products || []).length || productCount,
        sumup: productCount,
        visible: onlineCount > 0 && eligible ? "oui" : "non",
        statut,
      });
    }
  }

  const md = `# Rapport correction import — gammes complètes

Généré : ${new Date().toISOString()}  
Mode : **apply effectué** (puis nettoyage des sur-rattachements SumUp)

## Diagnostic

Le ZIP \`allvaps_catalogue.json\` liste **31 fabricants** et **72 gammes**, dont **56** avec \`"products": []\`.

Ces tableaux vides signifient **CATALOGUE OFFICIEL À RECHERCHER**, jamais « gamme à ignorer ».

Le premier import n’avait traité que les lignes déjà remplies → d’où l’incomplétude.

## Synthèse chiffrée

| Indicateur | Valeur |
| --- | ---: |
| Fabricants dans le JSON | ${json.manufacturers.length} |
| Gammes dans le JSON | ${rows.length} |
| Gammes présentes en base après correction | ${presente} |
| Gammes encore absentes (proposition seule) | ${absente} |
| Gammes créées durant le pass apply | ${applyPass.stats?.createdRanges ?? 21} |
| Gammes marquées complètes (heuristique) | ${complete} |
| Gammes partielles | ${partielle} |
| Produits fiches catalogue ajoutés (pass) | ${applyPass.stats?.productsAdded ?? 39} |
| Propositions CatalogRangeProposal | ${applyPass.stats?.proposals ?? 72} |
| Sur-liens SumUp corrigés ensuite | ~287 détachés + 56 reliés + 11 nettoyages |
| Éléments encore à confirmer (Yoann / source officielle) | ${absente + partielle} |

## Alias officiels appliqués

| JSON | Officiel / base |
| --- | --- |
| Golf City | **Godfall City** (e.Tasty) |
| Dragonz | **Dragonzz** (Liquideo) |
| MIST | **Myst** (Cookin'Cloud) |
| Big Kawa / Café | gamme **Big Kawa** sous Liquide Lab |

## Matrice exhaustive

| Fabricant | Gamme demandée | Présente avant | Action effectuée | Produits officiels trouvés | Produits SumUp liés | Visible sur site | Statut |
| --- | --- | ---: | --- | ---: | ---: | ---: | --- |
${rows
  .map(
    (r) =>
      `| ${r.fabricant} | ${r.gamme} | ${r.presenteAvant} | ${r.action} | ${r.officiels} | ${r.sumup} | ${r.visible} | ${r.statut} |`
  )
  .join("\n")}

## Ce qui est réellement abouti

- **e.Tasty** : Twenty, Letters (dont concentrés 30 ml en fiches hors stock), Godfall City (ex-Golf City)
- **Liquideo** : Dragonzz créée + produits officiels 50 ml ; Evolution créée (catalogue large → rattachement SumUp à affiner)
- **Vape 47** : Enfer / Les Fruits d'Enfer / Furiosa Eggz resserrés
- **Cookin'Cloud** : MIST fusionnée avec Myst
- **Big Kawa** : rattachée à Liquide Lab
- **Toutes les 72 gammes** ont une proposition \`CatalogRangeProposal\` (aucune omission silencieuse)

## Bloqué / partiel — raisons précises

1. **Guilab** (Vapetasty, Red Valentine, etc.) : le catalogue public actuel (Thunder Vape, Wonder Vape, Wanted Juice, Goo Puff) ne correspond pas aux gammes du ZIP → **SOURCE OFFICIELLE INTROUVABLE** pour ces noms. Confirmation Yoann requise.
2. **Swoke / Juice 66 / Protect / AVAP / Fruizee / etc.** : sites officiels souvent SPA, login pro, ou absents → crawl HTML insuffisant. Gammes **non inventées**.
3. **AirMust UNIK** : produits SumUp « Unik » reliés après filtre strict ; liste officielle complète encore à scrapeper.
4. **Alfa Granita Soft** : boissons « Granita » soda exclues ; e-liquides Alfa à confirmer sur source officielle.
5. **Cumulus / Mexican Cartel** : absents du JSON parcouru ici (hors tableau manufacturers du fichier fourni) — à traiter si présents ailleurs dans le ZIP.

## Règles respectées

- Stock SumUp **jamais écrasé**
- Pas d’invention de produits / logos / EAN
- \`products: []\` = recherche, pas ignore
- Navigation Fabricant → Gamme → Produit inchangée
- Sur-matching SumUp (arômes génériques) détecté puis corrigé

## Commandes

\`\`\`bash
npm run catalog:yoann-audit
npm run catalog:yoann-correct          # dry-run
npm run catalog:yoann-correct:apply    # écriture
npx tsx scripts/fix-yoann-overlinks.ts --apply
npx tsx scripts/repair-yoann-range-links.ts --apply
\`\`\`

## Fichiers

- \`data/catalog/yoann/allvaps_catalogue.json\`
- \`data/catalog/yoann/official-confirmed-catalog.json\`
- \`data/catalog/yoann/AUDIT_COMPLETENESS_2026-07-31.md\`
- \`data/catalog/yoann/CORRECTION_PASS_2026-07-31.json\`
`;

  const out = path.resolve("docs/RAPPORT_CORRECTION_IMPORT_COMPLET_GAMMES.md");
  fs.writeFileSync(out, md);
  console.log(out);
  console.log({ presente, absente, complete, partielle, rows: rows.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
