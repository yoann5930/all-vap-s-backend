/**
 * P1#4 — Inventaire ne mutates plus Product.unitsPerBox (admin packaging only).
 * npx tsx scripts/test-inventaire-units-per-box-admin-only-p1.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const linesSrc = readFileSync(
  "app/api/inventaire/sessions/[id]/lines/route.ts",
  "utf8"
);

assert.ok(
  !/prisma\.product\.update\(\s*\{[\s\S]*?unitsPerBox/.test(linesSrc),
  "POST lignes inventaire ne doit plus product.update({ unitsPerBox })"
);
assert.ok(
  linesSrc.includes("ne jamais écrire Product.unitsPerBox") ||
    linesSrc.includes("P1#4"),
  "garde P1#4 documentée dans la route lignes"
);
assert.ok(
  linesSrc.includes("unitsPerBoxSnapshot"),
  "snapshot ligne conservé"
);

const adminSrc = readFileSync(
  "app/api/admin/products/[id]/packaging-barcodes/route.ts",
  "utf8"
);
assert.ok(
  adminSrc.includes("unitsPerBox"),
  "admin packaging reste le chemin d’écriture"
);
assert.ok(
  adminSrc.includes("requireAdmin") ||
    /requireAuth\(["']ADMIN["']\)/.test(adminSrc),
  "écriture packaging réservée ADMIN"
);

const inventaireApis = [
  "app/api/inventaire/lookup/route.ts",
  "app/api/inventaire/sessions/[id]/lines/[lineId]/route.ts",
];
for (const f of inventaireApis) {
  const src = readFileSync(f, "utf8");
  assert.ok(
    !/prisma\.product\.update\(\s*\{[\s\S]*?unitsPerBox/.test(src),
    `${f} ne doit pas muter Product.unitsPerBox`
  );
}

console.log("OK P1#4 — Product.unitsPerBox admin-only (pas via scan inventaire)");
