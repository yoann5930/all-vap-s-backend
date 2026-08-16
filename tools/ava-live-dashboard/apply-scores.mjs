import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(dir, "data", "state.json");
const s = JSON.parse(fs.readFileSync(statePath, "utf8"));

const scores = {
  core: [62, "PARTIAL"],
  voice: [80, "PARTIAL"],
  memory: [48, "PARTIAL"],
  android: [58, "PARTIAL"],
  server: [80, "OK"],
  site: [82, "OK"],
  database: [85, "OK"],
  stocks: [55, "PARTIAL"],
  orders: [58, "PARTIAL"],
  fidelatoo: [45, "PARTIAL"],
  email: [40, "DEGRADED"],
  shipping: [50, "PARTIAL"],
  catalog: [88, "OK"],
  nicotine: [68, "PARTIAL"],
  vape: [58, "PARTIAL"],
  security: [60, "PARTIAL"],
  monitoring: [55, "PARTIAL"],
  logs: [55, "PARTIAL"],
  autodiag: [45, "PARTIAL"],
  tests: [62, "PARTIAL"],
  git: [72, "PARTIAL"],
};

for (const m of s.modules) {
  const next = scores[m.id];
  if (next) {
    m.score = next[0];
    m.status = next[1];
  }
}

s.score = 62;
s.scoreSource = "unit-tests-2026-08-16";
s.validatedFunctions = 20;
s.testsPassed = 113;
s.testsTotal = 113;
s.currentPhase = 13;
s.currentPhaseLabel = "PHASE 13 — TESTS E2E";
s.currentTask =
  "Unités OK. E2E Samsung / production / SMTP non validés. Score réel 62/100.";
s.phases = s.phases.map((p) => {
  if (p.id === 1) return { ...p, status: "DONE" };
  if (p.id >= 2 && p.id <= 12) return { ...p, status: "TESTING" };
  if (p.id === 13) return { ...p, status: "IN_PROGRESS" };
  return { ...p, status: "PENDING" };
});
s.activity = [
  ...(s.activity || []),
  { at: new Date().toISOString(), text: "Score recalculé 56 → 62 après tests unitaires réels (pas d'E2E, pas de prod)" },
];
s.blockers = [
  {
    id: "B-100",
    reason: "100/100 bloqué : production non déployée, E2E Samsung non exécuté, SMTP prod NOT_CONFIGURED, Chronopost enum non migré en base live",
    dependency: "www.allvaps.fr + ADB + MAIL + prisma migrate",
    action: "ne pas afficher PRODUCTION OK",
  },
];
s.paths = {
  site: "chatAva → runAvaOrchestrator (intents métier)",
  android: "PreferOnDevice GENERAL llama.cpp ; métier → /api/ava orchestrator",
  api: "runAvaOrchestrator → runAvaBrain",
};

fs.writeFileSync(statePath, JSON.stringify(s, null, 2));
console.log("score", s.score);
