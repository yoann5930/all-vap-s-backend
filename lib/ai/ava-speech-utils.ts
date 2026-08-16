/** Texte oral court — naturellement parlé, pas « robot call-center » */

import {
  pronounceEtasty,
  stripCatalogFactsFromSpeech,
} from "@/lib/ai/ava-voice-product-rules";
import { applyPronunciations } from "@/lib/ava/pronunciation-engine";
import { humanSellerPolish } from "@/lib/ava/conversation-style";

export const AVA_GREETING_SHORT =
  "Bonjour — Ava, All Vaps. Liquide, matériel, ou un souci à régler ?";

/** Prépare le texte pour une lecture fluide et humaine */
export function humanizeForSpeech(text: string): string {
  let out = text
    .replace(/👋/g, "")
    .replace(/A\.V\.A\./gi, "Ava")
    .replace(/\bA\s*[-.]?\s*V\s*[-.]?\s*A\b/gi, "Ava")
    .replace(/\bAVA\b/g, "Ava")
    .replace(/All Vap['’]?s/gi, "All Vaps")
    .replace(/e-liquides?/gi, "é liquides")
    .replace(/E-liquides?/g, "é liquides");

  // Dictionnaire marques (e.Tasty → i tésti, etc.)
  out = applyPronunciations(out);
  out = pronounceEtasty(out);

  // Sécurité : jamais lire prix / stock / volumes dans la voix
  out = stripCatalogFactsFromSpeech(out);
  out = humanSellerPolish(out);

  return out
    .replace(/\bDIY\b/gi, "Di-Yaï")
    .replace(/D I Y/gi, "Di-Yaï")
    .replace(/\bSAV\b/g, "service après-vente")
    .replace(/\bMTL\b/g, "tirage serré")
    .replace(/\bDL\b/g, "tirage aérien")
    .replace(/Les recommandations All Vap'?s sont indicatives[^.]*\./gi, "")
    .replace(/La vape ne soigne ni ne guérit\./gi, "")
    .replace(/Réservé aux \+?18 ans\./gi, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*\/\s*/g, " ou ")
    .replace(/\.{3,}/g, "…")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?…])/g, "$1")
    .trim();
}

export function toSpokenText(text: string, maxLen = 220): string {
  const clean = humanizeForSpeech(text);
  if (clean.length <= maxLen) return clean;

  const cut = clean.slice(0, maxLen);
  const lastStop = Math.max(
    cut.lastIndexOf("."),
    cut.lastIndexOf("!"),
    cut.lastIndexOf("?"),
    cut.lastIndexOf("…")
  );
  if (lastStop > 60) return cut.slice(0, lastStop + 1).trim();
  const lastComma = cut.lastIndexOf(",");
  if (lastComma > 60) return `${cut.slice(0, lastComma).trim()}.`;
  return `${cut.trim()}…`;
}

/** Prépare une réponse complète pour la file TTS, sans la tronquer. */
export function toCompleteSpokenText(text: string): string {
  return humanizeForSpeech(text);
}

export function toSubtitle(text: string, maxLen = 100): string {
  const line = text.split("\n").find((l) => l.trim().length > 0) ?? text;
  const clean = line.replace(/👋/g, "").trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

/** Découpe en phrases pour un rythme oral plus naturel (TTS navigateur) */
export function splitSpokenSentences(text: string): string[] {
  const clean = humanizeForSpeech(text);
  const parts = clean.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [clean];
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Extrait nicotine / PG-VG / contenance depuis le texte catalogue (si présents). */
export function parseCatalogSpecs(description: string | null | undefined): {
  nicotine: string | null;
  pgVg: string | null;
  volume: string | null;
} {
  const text = description ?? "";
  const nic = text.match(/(\d+(?:[.,]\d+)?)\s*mg(?:\/ml)?/i);
  const pgvg = text.match(/(\d+)\s*[\/:]\s*(\d+)\s*(?:pg\s*[\/:]\s*vg|vg\s*[\/:]\s*pg)?/i);
  const vol = text.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
  return {
    nicotine: nic ? `${nic[1].replace(",", ".")} mg` : null,
    pgVg: pgvg ? `${pgvg[1]}/${pgvg[2]}` : null,
    volume: vol ? `${vol[1]} ml` : null,
  };
}
