/**
 * AvaSpeechNormalizer — formes orales FR + artefacts STT fréquents.
 * But = le sens, pas un français soutenu artificiel.
 */
import { normalizeLoose } from "@/lib/ava/normalize-loose";

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bt['’]as\b/gi, "tu as"],
  [/\bt as\b/gi, "tu as"],
  [/\bta koi\b/gi, "tu as quoi"],
  [/\bta quoi\b/gi, "tu as quoi"],
  [/\bt['’]aurais\b/gi, "tu aurais"],
  [/\bt aurais\b/gi, "tu aurais"],
  [/\bt['’]es\b/gi, "tu es"],
  [/\bt es\b/gi, "tu es"],
  [/\bt tes qui\b/gi, "tu es qui"],
  [/\btes qui\b/gi, "tu es qui"],
  [/\bj['’]?veux\b/gi, "je veux"],
  [/\bj veux\b/gi, "je veux"],
  [/\bje ve\b/gi, "je veux"],
  [/\bj['’]?cherche\b/gi, "je cherche"],
  [/\bj cherche\b/gi, "je cherche"],
  [/\bj['’]?en veux\b/gi, "j'en veux"],
  [/\bchais pas\b/gi, "je ne sais pas"],
  [/\bché pas\b/gi, "je ne sais pas"],
  [/\bche pas\b/gi, "je ne sais pas"],
  [/\bje sais pas\b/gi, "je ne sais pas"],
  [/\bc['’]est quoi\b/gi, "c'est quoi"],
  [/\bc quoi\b/gi, "c'est quoi"],
  [/\bc koi\b/gi, "c'est quoi"],
  [/\bkoi\b/gi, "quoi"],
  [/\bc['’]est où\b/gi, "c'est où"],
  [/\bc ou(?=\s|$|[?!.])/gi, "c'est où"],
  [/\bc où(?=\s|$|[?!.])/gi, "c'est où"],
  [/\bc qui\b/gi, "c'est qui"],
  [/\by a\b/gi, "il y a"],
  [/\bya\b/gi, "il y a"],
  [/\bvous zetes\b/gi, "vous êtes"],
  [/\bvous zêtes\b/gi, "vous êtes"],
  [/\bzetes ou\b/gi, "êtes où"],
  [/\b(etes|êtes) ou\b/gi, "êtes où"],
  [/\btruk\b/gi, "truc"],
  [/\bfrai\b/gi, "frais"],
  [/\bfrui\b/gi, "fruit"],
  [/\brouj\b/gi, "rouge"],
  [/\bfais voir\b/gi, "montre"],
  [/\bt['’]as quoi de bon\b/gi, "tu as quoi de bon"],
  [/\bpas trop fort\b/gi, "pas trop fort"],
  [/\bun truc tranquille\b/gi, "un truc léger"],
  [/\bta combien\b/gi, "tu as combien"],
  [/\bon a combien de produit\b/gi, "on a combien de produits"],
  [/\bniveau stock\b/gi, "état du stock"],
  [/\by reste combien\b/gi, "il reste combien"],
  [/\bca donne quoi\b/gi, "ça donne quoi"],
];

export function normalizeOralFrench(raw: string): string {
  let s = (raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  for (const [re, to] of REPLACEMENTS) {
    s = s.replace(re, to);
  }
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function AvaSpeechNormalizer(raw: string): {
  raw: string;
  normalized: string;
  loose: string;
} {
  const normalized = normalizeOralFrench(raw);
  return {
    raw: raw || "",
    normalized,
    loose: normalizeLoose(normalized),
  };
}
