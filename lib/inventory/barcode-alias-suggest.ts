/**
 * Proposition d’association EAN inconnu → produit existant.
 * Jamais de fusion silencieuse. Interdit 50≠100 ml, nicotine différente, etc.
 */
import prisma from "@/lib/prisma";
import { normalizeProductName } from "@/lib/catalog/normalize";

export type AliasSuggestion = {
  productId: string;
  name: string;
  brand: string | null;
  range: string | null;
  volumeMl: number | null;
  barcode: string | null;
  score: number;
  reasons: string[];
};

function tokens(s: string): string[] {
  return normalizeProductName(s)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / Math.max(sa.size, sb.size);
}

/** Extrait 10/50/100 ml depuis un libellé. */
export function parseVolumeMlFromText(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).match(/\b(10|50|100)\s*ml\b/i);
  if (!m) return null;
  return Number(m[1]);
}

/** Extrait nicotine approximative (0/3/6/12/18 mg). */
export function parseNicotineMgFromText(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).match(/\b(\d{1,2})\s*mg\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Cherche un produit existant probable pour un EAN inconnu + indices nom/marque/volume.
 * score ≥ 0.72 → proposition (jamais auto-fusion).
 */
export async function suggestProductForUnknownBarcode(params: {
  barcode: string;
  nameHint?: string | null;
  brandHint?: string | null;
  rangeHint?: string | null;
  volumeMlHint?: number | null;
  nicotineMgHint?: number | null;
}): Promise<AliasSuggestion | null> {
  const nameHint = (params.nameHint || "").trim();
  if (nameHint.length < 4) return null;

  const hintTokens = tokens(nameHint);
  const brandHint = normalizeProductName(params.brandHint || "");
  const rangeHint = normalizeProductName(params.rangeHint || "");
  const vol =
    params.volumeMlHint ?? parseVolumeMlFromText(nameHint) ?? null;
  const nic =
    params.nicotineMgHint ?? parseNicotineMgFromText(nameHint) ?? null;

  const candidates = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: hintTokens[0] || nameHint.slice(0, 8), mode: "insensitive" } },
        ...(brandHint
          ? [{ brand: { contains: params.brandHint!.trim(), mode: "insensitive" as const } }]
          : []),
      ],
    },
    select: {
      id: true,
      name: true,
      brand: true,
      range: true,
      volumeMl: true,
      barcode: true,
      variants: {
        where: { active: true },
        select: { nicotineMg: true },
        take: 8,
      },
    },
    take: 40,
  });

  let best: AliasSuggestion | null = null;

  for (const p of candidates) {
    const reasons: string[] = [];
    // Interdits absolus
    if (vol != null && p.volumeMl != null && vol !== p.volumeMl) {
      continue; // 50 ≠ 100
    }
    if (nic != null) {
      const nics = p.variants
        .map((v) => v.nicotineMg)
        .filter((n): n is number => n != null);
      if (nics.length && !nics.some((n) => Math.abs(n - nic) < 0.05)) {
        continue;
      }
    }

    const pt = tokens(p.name);
    const nameScore = jaccard(hintTokens, pt);
    if (nameScore < 0.45) continue;
    reasons.push(`nom≈${Math.round(nameScore * 100)}%`);

    let score = nameScore;
    if (brandHint && normalizeProductName(p.brand || "") === brandHint) {
      score += 0.15;
      reasons.push("marque");
    }
    if (rangeHint && normalizeProductName(p.range || "") === rangeHint) {
      score += 0.1;
      reasons.push("gamme");
    }
    if (vol != null && p.volumeMl === vol) {
      score += 0.12;
      reasons.push(`${vol}ml`);
    }

    // Exiger assez de tokens en commun (pas juste "ananas")
    const inter = hintTokens.filter((t) => pt.includes(t)).length;
    if (inter < 2 && nameScore < 0.7) continue;

    if (!best || score > best.score) {
      best = {
        productId: p.id,
        name: p.name,
        brand: p.brand,
        range: p.range,
        volumeMl: p.volumeMl,
        barcode: p.barcode,
        score,
        reasons,
      };
    }
  }

  if (!best || best.score < 0.72) return null;
  return best;
}
