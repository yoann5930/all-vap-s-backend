/**
 * Backfill SQL : gammes avec produits publiés → OFFICIAL_CONFIRMED.
 * Utilise $executeRaw pour fonctionner même si `prisma generate` est bloqué (DLL).
 */
import prisma from "../lib/prisma";

async function main() {
  const confirmed = await prisma.$executeRawUnsafe(`
    UPDATE "ProductRange" AS r
    SET
      "verificationStatus" = 'OFFICIAL_CONFIRMED',
      "catalogVisible" = true,
      "verifiedAt" = COALESCE(r."verifiedAt", NOW()),
      "officialManufacturerUrl" = COALESCE(
        r."officialManufacturerUrl",
        (SELECT m.website FROM "Manufacturer" m WHERE m.id = r."manufacturerId")
      ),
      "verificationEvidence" = COALESCE(
        r."verificationEvidence",
        '{"note":"Backfill transition — gamme déjà publiée avec produits. Re-vérifier site officiel si besoin."}'
      )
    WHERE EXISTS (
      SELECT 1 FROM "Product" p
      WHERE p."rangeId" = r.id
        AND p."visibleOnline" = true
        AND p."isActive" = true
        AND p."catalogStatus" IN ('valide', 'actif')
    )
  `);

  const mfr = await prisma.$executeRawUnsafe(`
    UPDATE "Manufacturer"
    SET
      "verificationStatus" = 'OFFICIAL_CONFIRMED',
      "verifiedAt" = COALESCE("verifiedAt", NOW()),
      "officialCatalogUrl" = COALESCE("officialCatalogUrl", website)
    WHERE status = 'verifie' AND website IS NOT NULL
  `);

  console.log(JSON.stringify({ rangesConfirmed: confirmed, manufacturersUpdated: mfr }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
