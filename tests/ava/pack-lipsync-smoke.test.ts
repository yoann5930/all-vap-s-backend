/**
 * Smoke pack Ava (lipsync + assets).
 * Run: npx tsx tests/ava/pack-lipsync-smoke.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  createSpeechTimeline,
  sampleVisemeAt,
  visemeForCharacter,
} from "../../lib/ava/pack-lipsync";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

console.log("\n=== AVA pack smoke ===\n");

const assets = [
  "public/assets/ava/avatar.glb",
  "public/assets/ava/avatar-color.jpg",
  "public/assets/ava/avatar-normal.jpg",
  "public/assets/ava/avatar-material.jpg",
];

for (const rel of assets) {
  run(`asset ${rel}`, () => {
    const p = path.join(process.cwd(), rel);
    assert.equal(existsSync(p), true);
    assert.ok(statSync(p).size > 1000);
  });
}

run("voyelles bien ouvertes", () => {
  assert.ok(visemeForCharacter("a").open > 0.85);
  assert.ok(visemeForCharacter("é").wide > 0.5);
});

run("sons arrondis", () => {
  assert.ok(visemeForCharacter("o").round > 0.5);
});

run("bilabiales fermées", () => {
  assert.ok(visemeForCharacter("b").open < 0.1);
  assert.ok(visemeForCharacter("m").open < 0.1);
});

run("digramme ou arrondi", () => {
  const tl = createSpeechTimeline("Bonjour", 1000);
  const ou = tl.find((k) => k.round > 0.7);
  assert.ok(ou, "attendu un keyframe arrondi (ou)");
});

run("sampleVisemeAt interpolé", () => {
  const tl = createSpeechTimeline("Salut Ava!", 2000);
  const mid = sampleVisemeAt(tl, 400);
  assert.ok(mid.open >= 0);
  assert.ok(mid.open <= 1);
});

run("timeline ordonnée", () => {
  const tl = createSpeechTimeline("Bonjour!", 1000);
  assert.ok(tl.length > 5);
  assert.equal(tl[0].start, 0);
  assert.ok(Math.abs(tl[tl.length - 1].end - 1000) < 1);
});

console.log("\nOK\n");
