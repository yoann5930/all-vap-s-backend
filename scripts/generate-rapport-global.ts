/**
 * Met à jour l'en-tête de docs/RAPPORT_GLOBAL.md (date, version, stats git).
 * Le corps à partir de « ## 1. » est conservé tel quel.
 *
 * npm run docs:rapport-global
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";

const root = process.cwd();
const globalPath = path.join(root, "docs", "RAPPORT_GLOBAL.md");

function sh(cmd: string): string {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const version = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8")
).version as string;

const shortstat = sh("git diff --shortstat HEAD");
const porcelain = sh("git status --porcelain");
const lines = porcelain ? porcelain.split(/\r?\n/).filter(Boolean) : [];
const untracked = lines.filter((l) => l.startsWith("??")).length;
const modified = lines.filter((l) => !l.startsWith("??")).length;
const stamp = new Date().toISOString();

if (!existsSync(globalPath)) {
  console.error("Manquant:", globalPath);
  process.exit(1);
}

const current = readFileSync(globalPath, "utf8");
const bodyMatch = current.match(/\n## 1\./);
if (!bodyMatch || bodyMatch.index === undefined) {
  console.error("Impossible de trouver la section « ## 1. » dans RAPPORT_GLOBAL.md");
  process.exit(1);
}
const body = current.slice(bodyMatch.index + 1); // keep starting at ## 1.

const banner = `<!-- auto-header:docs:rapport-global ${stamp} -->
# RAPPORT GLOBAL — All Vap’s

> **Tableau de bord unique.** Après chaque mission : 1) rapport module 2) ce fichier 3) tests 4) erreurs 5) bloquants.  
> **Ne jamais écrire « Mission terminée » si un blocker subsiste.**

**Date de génération :** ${stamp}  
**Version projet :** \`${version}\`  
**Stats git (working tree) :** ${shortstat || "n/a"} · porcelain=${lines.length} · untracked≈${untracked} · modified≈${modified}  
**Commande :** \`npm run docs:rapport-global\`

---

`;

writeFileSync(globalPath, banner + body, "utf8");
console.log("Updated", globalPath);
console.log(`version=${version} files=${lines.length} untracked≈${untracked}`);
