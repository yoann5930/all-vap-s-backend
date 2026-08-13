/**
 * P0#4 — Médias inventaire protégés (auth + pas d’URL Blob publique).
 * npx tsx scripts/test-inventaire-media-auth-p0.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  inventoryBlobPathname,
  inventoryMediaApiPath,
} from "../lib/inventory/photo-storage";

assert.equal(
  inventoryMediaApiPath("sess-1", "a.jpg"),
  "/api/inventaire/media/sess-1/a.jpg"
);
assert.equal(
  inventoryMediaApiPath("../evil", "x.jpg"),
  "/api/inventaire/media/evil/x.jpg"
);
assert.equal(
  inventoryBlobPathname("s1", "f.webp"),
  "inventory/s1/f.webp"
);

const mediaRoute = readFileSync(
  "app/api/inventaire/media/[...path]/route.ts",
  "utf8"
);
assert.ok(
  mediaRoute.includes("requireInventoryAuth"),
  "GET media doit exiger requireInventoryAuth"
);
assert.ok(
  mediaRoute.includes("assertStoreAllowed"),
  "GET media doit vérifier la boutique"
);
assert.ok(
  mediaRoute.includes("readInventoryPhotoBuffer"),
  "GET media doit lire via buffer sécurisé"
);

const storage = readFileSync("lib/inventory/photo-storage.ts", "utf8");
assert.ok(storage.includes('access: "private"'), "Blob doit être private");
assert.ok(
  storage.includes("inventoryMediaApiPath"),
  "photoPath doit passer par l’API media"
);
assert.ok(
  storage.includes(".data") && storage.includes("inventory-photos"),
  "stockage local hors public/"
);
assert.equal(
  /access:\s*"public"/.test(storage),
  false,
  "plus d’upload Blob public"
);
assert.equal(
  /public\/uploads\/inventory/.test(storage) &&
    /writeFile\(path\.join\(dir/.test(storage) &&
    storage.includes('path.join(process.cwd(), "public"'),
  false
);
// Écriture sous public/uploads ne doit plus être le chemin principal
assert.ok(
  !storage.includes('path.join(process.cwd(), "public", "uploads", "inventory"'),
  "ne plus écrire sous public/uploads/inventory"
);

console.log("OK P0#4 — médias inventaire auth + Blob privé + disque hors public");
