/**
 * Smoke pack Ava (lipsync + assets).
 * Run: npx tsx tests/ava/pack-lipsync-smoke.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  createSpeechTimeline,
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

run("voyelles ouvertes", () => {
  assert.ok(visemeForCharacter("a").open > 0.5);
  assert.ok(visemeForCharacter("é").wide > 0.5);
});

run("sons arrondis", () => {
  assert.ok(visemeForCharacter("o").round > 0.5);
});

run("bilabiales fermées", () => {
  assert.ok(visemeForCharacter("b").open < 0.1);
  assert.ok(visemeForCharacter("m").open < 0.1);
});

run("ponctuation au repos", () => {
  assert.deepEqual(visemeForCharacter("."), { open: 0, wide: 0, round: 0 });
});

run("timeline ordonnée", () => {
  const tl = createSpeechTimeline("Bonjour!", 1000);
  assert.ok(tl.length > 5);
  assert.equal(tl[0].start, 0);
  assert.ok(Math.abs(tl[tl.length - 1].end - 1000) < 1);
});

console.log("\nOK\n");
