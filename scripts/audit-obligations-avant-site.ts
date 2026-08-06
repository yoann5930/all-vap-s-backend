/**
 * Audit obligations catalogue AVANT publication site.
 * Dry-run only — n'écrit rien en base.
 */
import "./load-env";
import prisma from "../lib/prisma";
import {
  evaluateEliquidePublishGate,
  isEliquideProduct,
  namesAreCompatible,
  parseNameProvenance,
  hasOfficialProductImage,
} from "../lib/catalog/official-sumup-policy";
import { isValidEan13 } from "../lib/catalog/en13";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const online = await prisma.product.findMany({
    where: { visibleOnline: true, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      productType: true,
      volumeMl: true,
      sumupName: true,
      sumupProductId: true,
      sumupMapping: true,
      imageStatus: true,
      imageUrl: true,
      priceCents: true,
      barcode: true,
      importAnomaly: true,
      catalogStatus: true,
      brand: true,
      range: true,
    },
  });

  const eliquides = online.filter((p) =>
    isEliquideProduct({
      category: p.category,
      productType: p.productType,
      volumeMl: p.volumeMl,
    })
  );

  const violations: Array<Record<string, unknown>> = [];
  const warnings: Array<Record<string, unknown>> = [];

  // Doublons sumupProductId / slug online
  const bySumup = new Map<string, string[]>();
  const bySlug = new Map<string, string[]>();
  for (const p of eliquides) {
    if (p.sumupProductId) {
      const a = bySumup.get(p.sumupProductId) || [];
      a.push(p.name);
      bySumup.set(p.sumupProductId, a);
    }
    const s = bySlug.get(p.slug) || [];
    s.push(p.name);
    bySlug.set(p.slug, s);
  }
  for (const [id, names] of bySumup) {
    if (names.length > 1) {
      violations.push({ rule: "no_duplicates", type: "sumupProductId", id, names });
    }
  }

  for (const p of eliquides) {
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
    });

    if (!gate.canPublishOnline) {
      violations.push({
        rule: "publish_gate",
        name: p.name,
        slug: p.slug,
        reasons: gate.reasons,
        anomalies: gate.anomalies,
      });
    }

    // Image fichier présent ?
    if (p.imageUrl?.startsWith("/media/")) {
      const abs = path.join(process.cwd(), "public", p.imageUrl.replace(/^\//, ""));
      if (!fs.existsSync(abs)) {
        violations.push({
          rule: "photo_file_missing",
          name: p.name,
          imageUrl: p.imageUrl,
        });
      }
    }

    // Nom inventé vs SumUp sans preuve officielle
    const prov = parseNameProvenance(p.sumupMapping);
    if (
      p.sumupName &&
      prov.kind === "sumup" &&
      !namesAreCompatible(p.name, p.sumupName)
    ) {
      violations.push({
        rule: "nom_incompatible_sumup",
        name: p.name,
        sumupName: p.sumupName,
      });
    }

    // EAN inventé ? on ne peut que valider le format s'il est présent
    if (p.barcode) {
      if (!isValidEan13(p.barcode)) {
        warnings.push({
          rule: "ean13_format",
          name: p.name,
          barcode: p.barcode,
        });
      }
    } else {
      warnings.push({ rule: "ean13_absent", name: p.name, slug: p.slug });
    }

    if (!hasOfficialProductImage(p)) {
      violations.push({ rule: "photo_non_officielle", name: p.name, imageStatus: p.imageStatus });
    }
  }

  // Outbox push prêt ?
  const outbox = path.resolve("outbox_sumup/LATEST_items-push_ALLVAPS.csv");
  const inbox = fs.existsSync("inbox_sumup")
    ? fs.readdirSync("inbox_sumup").filter((f) => /items-export.*\.csv$/i.test(f))
    : [];

  const report = {
    date: new Date().toISOString(),
    verdict:
      violations.length === 0
        ? "OK_POUR_SITE"
        : "BLOCAGE_OBLIGATIONS_NON_RESPECTEES",
    onlineTotal: online.length,
    onlineEliquides: eliquides.length,
    violationCount: violations.length,
    warningCount: warnings.length,
    obligations: {
      sumup_lie: "sumupProductId + sumupName obligatoires en ligne",
      photo_officielle: "imageStatus official|validated + fichier /media/",
      pas_invention_nom: "name compatible sumupName ou preuve URL officielle",
      pas_invention_ean: "EAN seulement si valide / présent — jamais inventé",
      anti_doublons: "1 sumupProductId = 1 produit online",
      push_sumup:
        "CSV outbox_sumup à importer dans SumUp Articles (pas d'API catalogue)",
    },
    sumupFiles: {
      inboxExports: inbox.length,
      outboxPushReady: fs.existsSync(outbox),
      outboxPath: outbox,
    },
    violations: violations.slice(0, 80),
    warningsSample: warnings.slice(0, 40),
    eanAbsentCount: warnings.filter((w) => w.rule === "ean13_absent").length,
    eanInvalidCount: warnings.filter((w) => w.rule === "ean13_format").length,
  };

  const out = path.resolve("data/rebuild/AUDIT_OBLIGATIONS_AVANT_SITE.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
  process.exit(violations.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
