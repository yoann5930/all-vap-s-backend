/**
 * Tests unitaires boutique la plus proche (Haversine + recherche locale).
 * Exécution : npx tsx scripts/test-nearest-store.ts
 */
import { findNearestStore, haversineKm, formatStorePhone } from "../lib/stores/nearest";
import { searchStoreByCityOrPostal } from "../lib/stores/geocode-fr";

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

async function main() {
  console.log("=== Nearest store tests ===\n");

  // Près de Hautmont
  {
    const r = findNearestStore(50.251, 3.922);
    assert(r.store.id === "hautmont", "GPS près Hautmont → Hautmont");
    assert(r.otherStore.id === "le-quesnoy", "autre = Le Quesnoy");
    assert(r.distanceKm < 2, "distance Hautmont < 2 km");
  }

  // Près du Quesnoy
  {
    const r = findNearestStore(50.249, 3.637);
    assert(r.store.id === "le-quesnoy", "GPS près Le Quesnoy → Le Quesnoy");
    assert(r.otherStore.id === "hautmont", "autre = Hautmont");
  }

  // Point milieu approximatif
  {
    const midLat = (50.2508 + 50.2488) / 2;
    const midLng = (3.9217 + 3.6365) / 2;
    const r = findNearestStore(midLat, midLng);
    assert(
      r.store.id === "hautmont" || r.store.id === "le-quesnoy",
      `milieu → boutique valide (${r.store.id}, ${r.distanceKm} km)`
    );
  }

  // Haversine distance entre boutiques ~20 km
  {
    const d = haversineKm(50.2508, 3.9217, 50.2488, 3.6365);
    assert(d > 15 && d < 30, `distance inter-boutiques ~20 km (got ${d.toFixed(1)})`);
  }

  // Téléphones formatés (source lib/stores)
  assert(
    formatStorePhone("+33327496100").includes("03"),
    "format téléphone Hautmont"
  );
  assert(
    formatStorePhone("+33327496200").includes("03"),
    "format téléphone Le Quesnoy"
  );

  // Recherche manuelle locale
  {
    const a = await searchStoreByCityOrPostal("59330");
    assert(a.ok && a.ok && a.result.store.id === "hautmont", "CP 59330 → Hautmont");
    const b = await searchStoreByCityOrPostal("Le Quesnoy");
    assert(b.ok && b.result.store.id === "le-quesnoy", "ville Le Quesnoy");
    const c = await searchStoreByCityOrPostal("59530");
    assert(c.ok && c.result.store.id === "le-quesnoy", "CP 59530 → Le Quesnoy");
    const d = await searchStoreByCityOrPostal("Maubeuge");
    assert(d.ok && d.result.store.id === "hautmont", "Maubeuge → Hautmont");
    const e = await searchStoreByCityOrPostal("x");
    assert(!e.ok, "requête trop courte refusée");
  }

  console.log(`\nRésultat : ${passed} OK, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
