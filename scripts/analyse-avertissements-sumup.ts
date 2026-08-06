/**
 * Analyse lecture seule des avertissements SumUp restants.
 * Aucune écriture DB. Produit QUEUE + rapport MD.
 */
import fs from "node:fs";
import path from "node:path";
import "./load-env";
import prisma from "../lib/prisma";
import { normalizeCatalogKey } from "../lib/catalog/assert-no-duplicates";

const REBUILD = path.resolve("data/rebuild");
const OUT_QUEUE = path.join(REBUILD, "QUEUE_VALIDATION_SUMUP_RESTANTE.json");
const OUT_MD = path.resolve("catalogues/rapports/RAPPORT_AVERTISSEMENTS_SUMUP_RESTANTS.md");
const AUDIT = path.join(REBUILD, "RAPPORT_RAPPROCHEMENT_SUMUP_CATALOGUE.json");
const JOURNAL = path.resolve("backups/sumup-audit-2026-08-03/JOURNAL_APPLY_EXACT.json");
const PRE = path.resolve("backups/sumup-audit-2026-08-03/pre-apply-exact/PRODUCTS_SNAPSHOT.json");

type Status =
  | "VALIDATION_MANUELLE_SIMPLE"
  | "DONNEES_MANQUANTES"
  | "EAN_DUPLIQUE"
  | "SUMUP_ID_CONFLICT"
  | "FORMAT_DIFFERENT"
  | "NICOTINE_DIFFERENTE"
  | "CONCENTRE_VS_ELIQUIDE"
  | "NOM_TROP_AMBIGU"
  | "PRODUIT_HISTORIQUE"
  | "PRODUIT_INACTIF"
  | "SERVICE_OU_REMISE"
  | "AUCUNE_CORRESPONDANCE";

type QueueEntry = {
  nomSumUp: string | null;
  sumupProductId: string | null;
  ean: string | null;
  categorieSumUp: string | null;
  produitCatalogueCandidat: string | null;
  produitCatalogueId: string | null;
  fabricant: string | null;
  gamme: string | null;
  format: string | null;
  nicotine: string | null;
  statut: Status;
  raisonExacte: string;
  actionRecommandee: string;
  validationHumaineRequise: true;
  differences?: Record<string, unknown>;
  source: string;
};

function extractVolume(name: string): number | null {
  const m = (name || "").match(/\b(\d+)\s*ml\b/i);
  return m ? Number(m[1]) : null;
}
function extractNicotine(name: string): number | null {
  const m = (name || "").match(/\b(\d+(?:[.,]\d+)?)\s*mg\b/i);
  return m ? Number(m[1].replace(",", ".")) : null;
}
function isConcentrate(name: string): boolean {
  return /\bconcentr[eé]|ar[oô]me\b/i.test(name || "");
}
function isServiceOrRemise(name: string, category: string): boolean {
  const blob = `${name} ${category}`.toLowerCase();
  return /\b(remise|discount|service|frais|consigne|consignes|pourboire|tip|don |carte cadeau|gift card|abonnement|shipping|livraison|acompte)\b/i.test(
    blob,
  );
}

function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

async function main() {
  const audit = JSON.parse(fs.readFileSync(AUDIT, "utf8"));
  const journal = fs.existsSync(JOURNAL) ? JSON.parse(fs.readFileSync(JOURNAL, "utf8")) : [];
  const pre = JSON.parse(fs.readFileSync(PRE, "utf8"));

  const products = await prisma.product.findMany({
    include: {
      manufacturer: { select: { slug: true, name: true } },
      rangeRef: { select: { slug: true, name: true } },
    },
  });

  // Integrity vs snapshot after apply
  const preById = new Map(pre.products.map((p: any) => [p.id, p]));
  let priceChanged = 0;
  let stockChanged = 0;
  let deleted = 0;
  let barcodeChanged = 0;
  let sumupOverwritten = 0;
  for (const old of pre.products) {
    const now = products.find((p) => p.id === old.id);
    if (!now) {
      deleted += 1;
      continue;
    }
    if (now.priceCents !== old.priceCents) priceChanged += 1;
    if (now.stock !== old.stock) stockChanged += 1;
    if ((now.barcode || null) !== (old.barcode || null)) barcodeChanged += 1;
    if (old.sumupProductId && now.sumupProductId && old.sumupProductId !== now.sumupProductId) {
      sumupOverwritten += 1;
    }
  }

  const appliedExact = journal.filter((j: any) => !j.refused).length;
  const refusedExact = journal.filter((j: any) => j.refused).length;

  // Duplicate SumUp IDs / EANs in catalog
  const bySumup = new Map<string, typeof products>();
  const byEan = new Map<string, typeof products>();
  for (const p of products) {
    if (p.sumupProductId) {
      if (!bySumup.has(p.sumupProductId)) bySumup.set(p.sumupProductId, [] as any);
      (bySumup.get(p.sumupProductId) as any).push(p);
    }
    const ean = (p.barcode || "").replace(/\D/g, "");
    if (ean) {
      if (!byEan.has(ean)) byEan.set(ean, [] as any);
      (byEan.get(ean) as any).push(p);
    }
  }
  const dupSumup = [...bySumup.entries()].filter(([, list]) => (list as any[]).length > 1);
  const dupEan = [...byEan.entries()].filter(([, list]) => (list as any[]).length > 1);

  const queue: QueueEntry[] = [];

  // 1) MATCH_STRICT_NAME — side by side, no apply
  const strict = (audit.products || []).filter((p: any) => p.status === "MATCH_STRICT_NAME");
  for (const row of strict) {
    const cat = products.find((p) => p.id === row.catalogProductId);
    const sn = row.sumupName || "";
    const cn = cat?.name || row.catalogName || "";
    const sv = extractVolume(sn);
    const cv = cat?.volumeMl ?? extractVolume(cn);
    const snic = extractNicotine(sn);
    const cnic = extractNicotine(cn);
    let statut: Status = "VALIDATION_MANUELLE_SIMPLE";
    let raison = "Nom normalisé strict identique — EAN SumUp absent ; liaison non appliquée automatiquement";
    let action = "Valider manuellement la liaison sumupProductId si fabricant/gamme/format/nicotine coïncident";

    if (sv != null && cv != null && sv !== cv) {
      statut = "FORMAT_DIFFERENT";
      raison = `Formats différents : SumUp ${sv}ml vs catalogue ${cv}ml`;
      action = "Ne pas lier — corriger la fiche ou créer la variante manquante";
    } else if (snic != null && cnic != null && snic !== cnic) {
      statut = "NICOTINE_DIFFERENTE";
      raison = `Nicotine différente : SumUp ${snic}mg vs catalogue ${cnic}mg`;
      action = "Ne pas lier — vérifier les variantes nicotine";
    } else if (isConcentrate(sn) !== isConcentrate(cn)) {
      statut = "CONCENTRE_VS_ELIQUIDE";
      raison = "Concentré vs e-liquide incompatible";
      action = "Ne pas lier";
    } else if (normalizeCatalogKey(sn) !== normalizeCatalogKey(cn)) {
      statut = "NOM_TROP_AMBIGU";
      raison = "Noms normalisés non strictement égaux après recontrôle";
      action = "Revue humaine obligatoire";
    } else if (!row.sumupProductId) {
      statut = "DONNEES_MANQUANTES";
      raison = "Item id SumUp manquant sur la ligne";
      action = "Ré-exporter SumUp / compléter l’identifiant";
    }

    queue.push({
      nomSumUp: sn,
      sumupProductId: row.sumupProductId || null,
      ean: row.ean || null,
      categorieSumUp: row.category || null,
      produitCatalogueCandidat: cn || null,
      produitCatalogueId: cat?.id || row.catalogProductId || null,
      fabricant: cat?.manufacturer?.name || cat?.manufacturer?.slug || null,
      gamme: cat?.rangeRef?.name || cat?.rangeRef?.slug || null,
      format: cv != null ? `${cv} ml` : sv != null ? `${sv} ml` : null,
      nicotine: cnic != null ? `${cnic} mg` : snic != null ? `${snic} mg` : null,
      statut,
      raisonExacte: raison,
      actionRecommandee: action,
      validationHumaineRequise: true,
      differences: {
        sumupName: sn,
        catalogName: cn,
        sumupVolumeMl: sv,
        catalogVolumeMl: cv,
        sumupNicotineMg: snic,
        catalogNicotineMg: cnic,
        sumupPriceCents: row.sumupPriceCents,
        catalogPriceCents: cat?.priceCents ?? null,
        catalogHasSumupId: Boolean(cat?.sumupProductId),
        catalogSumupId: cat?.sumupProductId || null,
        imageStatus: row.imageStatus,
      },
      source: "MATCH_STRICT_NAME",
    });
  }

  // 2) NO_MATCH SumUp
  const noMatch = (audit.products || []).filter((p: any) => p.status === "NO_MATCH");
  for (const row of noMatch) {
    const name = (row.sumupName || "").trim();
    const cat = (row.category || "").trim();
    if (!name && !row.sumupProductId) {
      queue.push({
        nomSumUp: name || null,
        sumupProductId: row.sumupProductId || null,
        ean: row.ean || null,
        categorieSumUp: cat || null,
        produitCatalogueCandidat: null,
        produitCatalogueId: null,
        fabricant: null,
        gamme: null,
        format: null,
        nicotine: null,
        statut: "DONNEES_MANQUANTES",
        raisonExacte: "Ligne SumUp vide (sans nom ni Item id)",
        actionRecommandee: "Ignorer / nettoyer l’export SumUp",
        validationHumaineRequise: true,
        source: "NO_MATCH_EMPTY",
      });
      continue;
    }
    if (isServiceOrRemise(name, cat)) {
      queue.push({
        nomSumUp: name,
        sumupProductId: row.sumupProductId || null,
        ean: row.ean || null,
        categorieSumUp: cat || null,
        produitCatalogueCandidat: null,
        produitCatalogueId: null,
        fabricant: null,
        gamme: null,
        format: extractVolume(name) != null ? `${extractVolume(name)} ml` : null,
        nicotine: extractNicotine(name) != null ? `${extractNicotine(name)} mg` : null,
        statut: "SERVICE_OU_REMISE",
        raisonExacte: "Ligne SumUp probablement service / remise / hors produit catalogue",
        actionRecommandee: "Ne pas créer de fiche produit catalogue",
        validationHumaineRequise: true,
        source: "NO_MATCH",
      });
      continue;
    }
    queue.push({
      nomSumUp: name,
      sumupProductId: row.sumupProductId || null,
      ean: row.ean || null,
      categorieSumUp: cat || null,
      produitCatalogueCandidat: null,
      produitCatalogueId: null,
      fabricant: "À VÉRIFIER",
      gamme: "À VÉRIFIER",
      format: extractVolume(name) != null ? `${extractVolume(name)} ml` : "À VÉRIFIER",
      nicotine: extractNicotine(name) != null ? `${extractNicotine(name)} mg` : "À VÉRIFIER",
      statut: "AUCUNE_CORRESPONDANCE",
      raisonExacte: "Produit SumUp sans fiche catalogue correspondante (ID/EAN/nom)",
      actionRecommandee:
        "Créer une fiche proposition manuelle si produit réel vendu — ne pas publier auto",
      validationHumaineRequise: true,
      source: "NO_MATCH",
    });
  }

  // 3) Duplicate SumUp IDs
  for (const [id, list] of dupSumup) {
    const arr = list as typeof products;
    queue.push({
      nomSumUp: arr.map((p) => p.name).join(" | "),
      sumupProductId: id,
      ean: null,
      categorieSumUp: null,
      produitCatalogueCandidat: arr.map((p) => p.name).join(" | "),
      produitCatalogueId: arr.map((p) => p.id).join(","),
      fabricant: arr.map((p) => p.manufacturer?.slug || "?").join(","),
      gamme: arr.map((p) => p.rangeRef?.slug || "?").join(","),
      format: null,
      nicotine: null,
      statut: "SUMUP_ID_CONFLICT",
      raisonExacte: `Même sumupProductId relié à ${arr.length} produits catalogue`,
      actionRecommandee: "Séparer / corriger manuellement les liaisons incompatibles",
      validationHumaineRequise: true,
      differences: { products: arr.map((p) => ({ id: p.id, name: p.name, barcode: p.barcode })) },
      source: "CATALOG_DUP_SUMUP_ID",
    });
  }

  // 4) Duplicate EANs
  for (const [ean, list] of dupEan) {
    const arr = list as typeof products;
    queue.push({
      nomSumUp: null,
      sumupProductId: null,
      ean,
      categorieSumUp: null,
      produitCatalogueCandidat: arr.map((p) => p.name).join(" | "),
      produitCatalogueId: arr.map((p) => p.id).join(","),
      fabricant: arr.map((p) => p.manufacturer?.slug || "?").join(","),
      gamme: arr.map((p) => p.rangeRef?.slug || "?").join(","),
      format: null,
      nicotine: null,
      statut: "EAN_DUPLIQUE",
      raisonExacte: `EAN ${ean} partagé par ${arr.length} produits catalogue`,
      actionRecommandee: "Vérifier doublon réel vs erreur de saisie EAN",
      validationHumaineRequise: true,
      differences: {
        products: arr.map((p) => ({
          id: p.id,
          name: p.name,
          sumupProductId: p.sumupProductId,
        })),
      },
      source: "CATALOG_DUP_EAN",
    });
  }

  // 5) Catalogue without SumUp — classify
  const withoutSumup = products.filter((p) => !p.sumupProductId);
  for (const p of withoutSumup) {
    let statut: Status = "DONNEES_MANQUANTES";
    let raison = "Produit catalogue sans sumupProductId";
    let action = "Rechercher dans SumUp par EAN/nom exact puis lier manuellement";

    if (!p.isActive) {
      statut = "PRODUIT_INACTIF";
      raison = "Produit inactif sans liaison SumUp";
      action = "Conserver hors ligne ; lier seulement si réactivation caisse";
    } else if (
      p.catalogStatus === "archive" ||
      /historique|archive|obsolete/i.test(p.catalogStatus || "")
    ) {
      statut = "PRODUIT_HISTORIQUE";
      raison = "Statut catalogue historique/archive sans SumUp";
      action = "Ne pas importer depuis SumUp ; archivage OK";
    } else if (!p.barcode) {
      statut = "DONNEES_MANQUANTES";
      raison = "Sans SumUp et sans EAN — rapprochement automatique impossible";
      action = "Compléter EAN officiel ou lier manuellement avec Item id SumUp";
    } else {
      statut = "AUCUNE_CORRESPONDANCE";
      raison = "EAN présent mais aucune ligne SumUp exacte restante après apply EAN";
      action = "Vérifier si produit retiré de la caisse SumUp ou EAN incorrect";
    }

    queue.push({
      nomSumUp: null,
      sumupProductId: null,
      ean: p.barcode,
      categorieSumUp: null,
      produitCatalogueCandidat: p.name,
      produitCatalogueId: p.id,
      fabricant: p.manufacturer?.name || p.manufacturer?.slug || null,
      gamme: p.rangeRef?.name || p.rangeRef?.slug || null,
      format: p.volumeMl != null ? `${p.volumeMl} ml` : null,
      nicotine: null,
      statut,
      raisonExacte: raison,
      actionRecommandee: action,
      validationHumaineRequise: true,
      differences: {
        isActive: p.isActive,
        visibleOnline: p.visibleOnline,
        catalogStatus: p.catalogStatus,
      },
      source: "CATALOG_WITHOUT_SUMUP",
    });
  }

  // Counts by status
  const byStatus: Record<string, number> = {};
  for (const e of queue) byStatus[e.statut] = (byStatus[e.statut] || 0) + 1;

  const validationManuelleSimple = queue.filter((e) => e.statut === "VALIDATION_MANUELLE_SIMPLE");
  const impossibles = queue.filter((e) =>
    [
      "FORMAT_DIFFERENT",
      "NICOTINE_DIFFERENTE",
      "CONCENTRE_VS_ELIQUIDE",
      "NOM_TROP_AMBIGU",
      "SUMUP_ID_CONFLICT",
      "EAN_DUPLIQUE",
    ].includes(e.statut),
  );

  write(OUT_QUEUE, JSON.stringify({ generatedAt: new Date().toISOString(), count: queue.length, byStatus, entries: queue }, null, 2));

  const md = `# Rapport avertissements SumUp restants

**Date :** ${new Date().toISOString()}  
**Périmètre :** post \`--apply-exact-only\` — **aucune nouvelle application**

## Contrôles d’intégrité (re-vérifiés)

| Contrôle | Valeur |
|---|---:|
| Prix modifiés vs snapshot pré-apply | **${priceChanged}** |
| Stocks modifiés | **${stockChanged}** |
| Produits supprimés | **${deleted}** |
| sumupProductId remplacés | **${sumupOverwritten}** |
| EAN altérés | **${barcodeChanged}** |
| Liaisons EAN appliquées (journal) | **${appliedExact}** |
| Liaisons refusées (journal) | **${refusedExact}** |

## Recalcul global

| Indicateur | Valeur |
|---|---:|
| Correspondances exactes réellement appliquées | **${appliedExact}** |
| Produits catalogue avec SumUp | **${products.filter((p) => p.sumupProductId).length}** |
| Produits restant sans sumupProductId | **${withoutSumup.length}** |
| Produits SumUp sans fiche catalogue (NO_MATCH utiles) | **${noMatch.filter((r: any) => (r.sumupName || "").trim() || r.sumupProductId).length}** |
| Lignes NO_MATCH vides | **${noMatch.filter((r: any) => !(r.sumupName || "").trim() && !r.sumupProductId).length}** |
| Produits catalogue sans liaison SumUp | **${withoutSumup.length}** |
| Conflits sumupProductId dupliqués | **${dupSumup.length}** |
| EAN catalogue dupliqués | **${dupEan.length}** |
| Correspondances nom-seul (non appliquées) | **${strict.length}** |

## Classification des entrées restantes

| Statut | Nb |
|---|---:|
${Object.entries(byStatus)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join("\n")}

File : \`data/rebuild/QUEUE_VALIDATION_SUMUP_RESTANTE.json\` (${queue.length} entrées)

---

## 1. Cas sûrs mais validation humaine (nom strict)

**Nombre :** ${validationManuelleSimple.length}

Ces lignes ont un nom catalogue **identique** (normalisé), prix souvent identique, mais **sans EAN SumUp** — non liées automatiquement.

| SumUp | Catalogue | Fabricant | Format | Nicotine | Différences |
|---|---|---|---|---|---|
${validationManuelleSimple
  .map((e) => {
    const d = e.differences || {};
    return `| ${(e.nomSumUp || "").replace(/\|/g, "/")} | ${(e.produitCatalogueCandidat || "").replace(/\|/g, "/")} | ${e.fabricant || "—"} | ${e.format || "—"} | ${e.nicotine || "—"} | prix S=${(d as any).sumupPriceCents ?? "—"} / C=${(d as any).catalogPriceCents ?? "—"} ; image=${(d as any).imageStatus ?? "—"} ; sumupId catalogue=${(d as any).catalogHasSumupId ? "oui" : "non"} |`;
  })
  .join("\n") || "_aucun_"}

### Détail côte à côte (nom seul)

${strict
  .map((row: any) => {
    const cat = products.find((p) => p.id === row.catalogProductId);
    return `#### ${row.sumupName}

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | ${row.sumupName} | ${cat?.name || row.catalogName} |
| ID SumUp | \`${row.sumupProductId}\` | ${cat?.sumupProductId ? `\`${cat.sumupProductId}\`` : "**absent**"} |
| EAN | ${row.ean || "**absent**"} | ${cat?.barcode || "**absent**"} |
| Format | ${extractVolume(row.sumupName) ?? "—"} ml | ${cat?.volumeMl ?? extractVolume(cat?.name || "") ?? "—"} ml |
| Nicotine | ${extractNicotine(row.sumupName) ?? "—"} mg | ${extractNicotine(cat?.name || "") ?? "—"} mg |
| Fabricant | — | ${cat?.manufacturer?.name || "—"} |
| Gamme | — | ${cat?.rangeRef?.name || "—"} |
| Prix (cents) | ${row.sumupPriceCents ?? "—"} | ${cat?.priceCents ?? "—"} |

**Action proposée :** validation humaine pour renseigner \`sumupProductId=${row.sumupProductId}\` sur \`${cat?.id || "?"}\` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**
`;
  })
  .join("\n")}

---

## 2. Conflits techniques

- Doublons \`sumupProductId\` catalogue : **${dupSumup.length}**
- Autres conflits audit : **${audit.conflicts || 0}**

${dupSumup.length
  ? dupSumup
      .map(([id, list]) => {
        const arr = list as typeof products;
        return `- \`${id}\` → ${arr.map((p) => p.name).join(" || ")}`;
      })
      .join("\n")
  : "_aucun conflit sumupProductId_"}

---

## 3. Doublons EAN catalogue

**Nombre :** ${dupEan.length}

${dupEan
  .slice(0, 40)
  .map(([ean, list]) => {
    const arr = list as typeof products;
    return `- EAN \`${ean}\` → ${arr.map((p) => `\`${p.name}\``).join(" || ")}`;
  })
  .join("\n") || "_aucun_"}

---

## 4. Produits SumUp sans correspondance

${noMatch
  .filter((r: any) => (r.sumupName || "").trim() || r.sumupProductId)
  .map(
    (r: any) =>
      `- **${r.sumupName || "(sans nom)"}** · id=\`${r.sumupProductId || "—"}\` · EAN=${r.ean || "—"} · cat=${r.category || "—"}`,
  )
  .join("\n") || "_aucun produit nommé_"}

Lignes vides ignorables : ${noMatch.filter((r: any) => !(r.sumupName || "").trim() && !r.sumupProductId).length}

---

## 5. Produits anciens / inactifs (catalogue sans SumUp)

| Statut file | Nb |
|---|---:|
| PRODUIT_INACTIF | ${byStatus.PRODUIT_INACTIF || 0} |
| PRODUIT_HISTORIQUE | ${byStatus.PRODUIT_HISTORIQUE || 0} |

---

## 6. Lignes ne représentant pas un produit

| SERVICE_OU_REMISE | ${byStatus.SERVICE_OU_REMISE || 0} |
| DONNEES_MANQUANTES (lignes vides incluses) | ${byStatus.DONNEES_MANQUANTES || 0} |

---

## 7. Produits manquant dans le catalogue (SumUp → à créer ?)

Statut \`AUCUNE_CORRESPONDANCE\` issus de NO_MATCH : voir section 4.  
**Ne pas créer automatiquement.**

---

## 8. Produits catalogue absents de SumUp

**Total :** ${withoutSumup.length}

Répartition dans la file : \`CATALOG_WITHOUT_SUMUP\` (statuts INACTIF / HISTORIQUE / DONNEES_MANQUANTES / AUCUNE_CORRESPONDANCE).

---

## Cas impossibles à décider automatiquement

**Nombre :** ${impossibles.length}

${impossibles
  .slice(0, 50)
  .map((e) => `- **${e.statut}** — ${e.nomSumUp || e.produitCatalogueCandidat} — ${e.raisonExacte}`)
  .join("\n") || "_aucun hors doublons/conflits déjà listés_"}

---

## Synthèse chiffrée finale

- liaisons exactes appliquées : **${appliedExact}**
- produits encore sans liaison SumUp : **${withoutSumup.length}**
- produits SumUp sans catalogue : **${noMatch.filter((r: any) => (r.sumupName || "").trim() || r.sumupProductId).length}**
- produits catalogue sans SumUp : **${withoutSumup.length}**
- conflits : **${dupSumup.length + (audit.conflicts || 0)}**
- doublons : **${dupEan.length}** (EAN) / **${dupSumup.length}** (SumUp ID)
- validations manuelles simples : **${validationManuelleSimple.length}**
- cas impossibles à décider automatiquement : **${impossibles.length}**
- prix modifiés : **${priceChanged}**
- stocks modifiés : **${stockChanged}**
- produits supprimés : **${deleted}**

ÉTAT FINAL : AUDIT DES AVERTISSEMENTS TERMINÉ — VALIDATION HUMAINE REQUISE
`;

  write(OUT_MD, md);

  console.log(
    JSON.stringify(
      {
        appliedExact,
        refusedExact,
        catalogWithoutSumup: withoutSumup.length,
        sumupWithoutCatalog: noMatch.filter((r: any) => (r.sumupName || "").trim() || r.sumupProductId).length,
        strictName: strict.length,
        validationManuelleSimple: validationManuelleSimple.length,
        impossibles: impossibles.length,
        dupSumup: dupSumup.length,
        dupEan: dupEan.length,
        priceChanged,
        stockChanged,
        deleted,
        barcodeChanged,
        sumupOverwritten,
        queueEntries: queue.length,
        byStatus,
        outQueue: OUT_QUEUE,
        outMd: OUT_MD,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
