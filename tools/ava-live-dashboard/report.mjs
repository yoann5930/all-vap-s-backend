#!/usr/bin/env node
/**
 * Met à jour le dashboard live (localhost uniquement).
 * Usage: node report.mjs '{"currentTask":"...","activity":[{"at":"...","text":"..."}]}'
 *    ou: node report.mjs --file patch.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.AVA_DASHBOARD_PORT || 3856);

function nowIso() {
  return new Date().toISOString();
}

let patch;
const fileIdx = process.argv.indexOf("--file");
if (fileIdx >= 0) {
  patch = JSON.parse(fs.readFileSync(path.resolve(process.argv[fileIdx + 1]), "utf8"));
} else if (process.argv[2]) {
  patch = JSON.parse(process.argv[2]);
} else {
  patch = JSON.parse(fs.readFileSync(0, "utf8"));
}

if (Array.isArray(patch.activity)) {
  patch.activity = patch.activity.map((a) => ({
    at: a.at || nowIso(),
    text: a.text,
  }));
}

const res = await fetch(`http://127.0.0.1:${PORT}/api/report`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(patch),
});
const json = await res.json();
console.log(JSON.stringify(json));
