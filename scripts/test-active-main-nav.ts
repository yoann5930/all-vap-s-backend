/**
 * Tests navigation principale exclusive.
 * npx tsx scripts/test-active-main-nav.ts
 */
import {
  getActiveMainNavigation,
  isMainNavLinkActive,
  navIdFromHref,
  navIdFromProduct,
} from "../lib/navigation/active-main-nav";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  OK  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}`);
  }
}

function main() {
  console.log("=== Active main nav tests ===\n");

  assert(getActiveMainNavigation("/formats/20ml") === "e-liquides", "/formats/20ml → e-liquides");
  assert(getActiveMainNavigation("/e-liquides") === "e-liquides", "/e-liquides");
  assert(getActiveMainNavigation("/fabricants/e-tasty") === "e-liquides", "/fabricants → e-liquides");
  assert(getActiveMainNavigation("/gammes/twenty") === "e-liquides", "/gammes → e-liquides");

  // Fiche sans contexte : aucun onglet (évite faux positifs)
  assert(
    getActiveMainNavigation("/boutique/twenty-double-peche-20ml") === null,
    "fiche sans contexte → null"
  );

  // Fiche avec contexte produit
  assert(
    getActiveMainNavigation("/boutique/twenty-double-peche-20ml", "", {
      navId: "e-liquides",
    }) === "e-liquides",
    "fiche + contexte e-liquides"
  );

  // Ancien bug : liens /boutique?category=X ne doivent PAS tous s'activer sur une fiche
  assert(
    navIdFromHref("/boutique?category=resistances") === "resistances",
    "href résistances mappé"
  );
  assert(
    !isMainNavLinkActive(
      "/boutique?category=resistances",
      "RÉSISTANCES",
      getActiveMainNavigation("/boutique/twenty-double-peche-20ml", "", { navId: "e-liquides" })
    ),
    "RÉSISTANCES inactif sur fiche e-liquide"
  );
  assert(
    !isMainNavLinkActive(
      "/marques",
      "MARQUES",
      getActiveMainNavigation("/boutique/twenty-double-peche-20ml", "", { navId: "e-liquides" })
    ),
    "MARQUES inactif sur fiche e-liquide"
  );
  assert(
    isMainNavLinkActive(
      "/e-liquides",
      "E-LIQUIDES",
      getActiveMainNavigation("/boutique/twenty-double-peche-20ml", "", { navId: "e-liquides" })
    ),
    "E-LIQUIDES actif sur fiche e-liquide"
  );

  // Un seul actif : routes métier
  assert(getActiveMainNavigation("/resistances") === "resistances", "route résistances");
  assert(getActiveMainNavigation("/marques") === "marques", "route marques");
  assert(getActiveMainNavigation("/marques/e-tasty") === "marques", "marque détail");

  // Produit Twenty
  assert(
    navIdFromProduct({
      category: "E-liquides 20 ml",
      productType: "20ml",
      volumeMl: 20,
    }) === "e-liquides",
    "produit Twenty → e-liquides"
  );
  assert(
    navIdFromProduct({ category: "resistances", productType: null }) === "resistances",
    "produit résistance"
  );

  // exclusivité : un seul lien true
  const active = getActiveMainNavigation("/formats/20ml");
  const links = [
    { href: "/e-liquides", label: "E-LIQUIDES" },
    { href: "/resistances", label: "RÉSISTANCES" },
    { href: "/marques", label: "MARQUES" },
    { href: "/boutiques", label: "BOUTIQUES" },
  ];
  const actives = links.filter((l) => isMainNavLinkActive(l.href, l.label, active));
  assert(actives.length === 1 && actives[0].label === "E-LIQUIDES", "un seul onglet actif sur 20ml");

  console.log(`\nRésultat : ${passed} OK, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main();
