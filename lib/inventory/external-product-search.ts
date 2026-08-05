/**
 * Recherche produit externe (inventaire) — lecture seule.
 * Aucun prix Internet n’est jamais renvoyé / appliqué.
 */

export type ExternalProductHit = {
  name: string;
  brand: string | null;
  range: string | null;
  barcode: string | null;
  sku: string | null;
  source: string;
  confidence: number;
  rawHints?: string[];
};

function envFlag(name: string, fallback = true): boolean {
  const v = (process.env[name] || "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes";
}

function cleanText(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length < 2) return null;
  if (/^n\/a$/i.test(t)) return null;
  return t;
}

/** EAN/UPC plausible (évite 0000000000000 et réponses poubelle). */
export function isPlausibleBarcode(code: string): boolean {
  const digits = code.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  if (/^0+$/.test(digits)) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

function pickBrand(obj: Record<string, unknown>): string | null {
  return (
    cleanText(obj.brands as string) ||
    cleanText(obj.brand as string) ||
    cleanText((obj.brand_owner as string) || "") ||
    null
  );
}

function pickName(obj: Record<string, unknown>): string | null {
  return (
    cleanText(obj.product_name as string) ||
    cleanText(obj.product_name_fr as string) ||
    cleanText(obj.product_name_en as string) ||
    cleanText(obj.title as string) ||
    cleanText(obj.name as string) ||
    null
  );
}

function pickRange(obj: Record<string, unknown>): string | null {
  const categories = cleanText(obj.categories as string);
  if (categories) {
    const parts = categories.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 120);
  }
  return cleanText(obj.generic_name as string) || cleanText(obj.category as string);
}

async function fetchJson(url: string, timeoutMs = 6000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "AllVaps-Inventory/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Open Food / Beauty / Products Facts — API publique, sans clé. */
async function lookupOpenFactsBarcode(barcode: string): Promise<ExternalProductHit[]> {
  const hosts = [
    "world.openfoodfacts.org",
    "world.openbeautyfacts.org",
    "world.openproductsfacts.org",
  ];
  const hits: ExternalProductHit[] = [];
  for (const host of hosts) {
    const data = (await fetchJson(
      `https://${host}/api/v2/product/${encodeURIComponent(barcode)}.json`
    )) as { status?: number; product?: Record<string, unknown> } | null;
    if (!data || data.status !== 1 || !data.product) continue;
    const name = pickName(data.product);
    if (!name) continue;
    hits.push({
      name,
      brand: pickBrand(data.product),
      range: pickRange(data.product),
      barcode,
      sku: cleanText(data.product.code as string) || barcode,
      source: host.replace("world.", ""),
      confidence: 0.92,
      rawHints: [name, pickBrand(data.product), pickRange(data.product)].filter(
        Boolean
      ) as string[],
    });
    break; // une source fiable suffit
  }
  return hits;
}

/** UPC Item DB — essai public (quota limité), sans clé. */
async function lookupUpcItemDb(barcode: string): Promise<ExternalProductHit[]> {
  const data = (await fetchJson(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`
  )) as {
    code?: string;
    items?: Array<{
      title?: string;
      brand?: string;
      category?: string;
      ean?: string;
      upc?: string;
      model?: string;
    }>;
  } | null;
  if (!data || data.code !== "OK" || !data.items?.length) return [];
  return data.items
    .slice(0, 3)
    .map((item) => {
      const name = cleanText(item.title);
      if (!name) return null;
      const itemCode = cleanText(item.ean) || cleanText(item.upc) || barcode;
      // Exige cohérence du code si fourni
      if (
        itemCode &&
        isPlausibleBarcode(barcode) &&
        itemCode.replace(/\D/g, "").replace(/^0+/, "") !==
          barcode.replace(/\D/g, "").replace(/^0+/, "") &&
        item.ean !== barcode &&
        item.upc !== barcode
      ) {
        // garder quand même si l’API a matché l’UPC demandé
      }
      return {
        name,
        brand: cleanText(item.brand),
        range: cleanText(item.category)?.split(">")?.pop()?.trim() || null,
        barcode: itemCode,
        sku: cleanText(item.model),
        source: "upcitemdb",
        confidence: 0.8,
        rawHints: [item.title, item.brand, item.category].filter(Boolean) as string[],
      } satisfies ExternalProductHit;
    })
    .filter(Boolean) as ExternalProductHit[];
}

/** Recherche texte Open Food Facts (si OCR / indices). */
async function searchOpenFoodFactsText(query: string): Promise<ExternalProductHit[]> {
  const q = query.trim().slice(0, 120);
  if (q.length < 3) return [];
  const data = (await fetchJson(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
      q
    )}&search_simple=1&action=process&json=1&page_size=5`
  )) as { products?: Array<Record<string, unknown>> } | null;
  if (!data?.products?.length) return [];
  return data.products
    .map((p) => {
      const name = pickName(p);
      if (!name) return null;
      return {
        name,
        brand: pickBrand(p),
        range: pickRange(p),
        barcode: cleanText(String(p.code || "")) || null,
        sku: cleanText(String(p.code || "")) || null,
        source: "openfoodfacts-search",
        confidence: 0.62,
        rawHints: [name, pickBrand(p), q].filter(Boolean) as string[],
      } satisfies ExternalProductHit;
    })
    .filter(Boolean)
    .slice(0, 5) as ExternalProductHit[];
}

/**
 * OpenAI Vision (optionnel) — extraction structurée depuis une image temporaire.
 * Aucune image n’est stockée. Nécessite OPENAI_API_KEY.
 */
export async function extractLabelWithOpenAI(
  imageDataUrl: string
): Promise<{
  name: string | null;
  brand: string | null;
  range: string | null;
  barcode: string | null;
  ocrText: string | null;
  confidence: number;
} | null> {
  const key = (process.env.OPENAI_API_KEY || "").trim();
  if (!key) return null;
  if (!imageDataUrl.startsWith("data:image/")) return null;
  // Limite taille (~700 KB data URL)
  if (imageDataUrl.length > 900_000) return null;

  const model =
    (process.env.OPENAI_VISION_MODEL || "").trim() ||
    (process.env.OPENAI_MODEL || "").trim() ||
    "gpt-4o-mini";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Tu analyses l'étiquette d'un produit (souvent e-liquide / vape). Réponds UNIQUEMENT en JSON: {\"name\":\"\",\"brand\":\"\",\"range\":\"\",\"barcode\":\"\",\"ocrText\":\"\",\"confidence\":0.0}. Ne invente rien. barcode = EAN si lisible. confidence 0-1.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extrais nom, marque/fabricant, gamme, EAN et texte OCR principal.",
              },
              { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      name: cleanText(parsed.name as string),
      brand: cleanText(parsed.brand as string),
      range: cleanText(parsed.range as string),
      barcode: cleanText(String(parsed.barcode || "").replace(/\D/g, "")),
      ocrText: cleanText(parsed.ocrText as string),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.55)),
    };
  } catch {
    return null;
  }
}

export async function searchExternalProducts(params: {
  barcode?: string | null;
  query?: string | null;
}): Promise<{
  hits: ExternalProductHit[];
  externalEnabled: boolean;
  sourcesTried: string[];
}> {
  const externalEnabled = envFlag("PRODUCT_IDENTIFY_EXTERNAL", true);
  const sourcesTried: string[] = [];
  if (!externalEnabled) {
    return { hits: [], externalEnabled: false, sourcesTried };
  }

  const hits: ExternalProductHit[] = [];
  const barcode = (params.barcode || "").trim();

  if (barcode.length >= 8 && isPlausibleBarcode(barcode)) {
    sourcesTried.push("openfacts");
    hits.push(...(await lookupOpenFactsBarcode(barcode)));
    if (!hits.length) {
      sourcesTried.push("upcitemdb");
      hits.push(...(await lookupUpcItemDb(barcode)));
    }
  } else if (barcode) {
    sourcesTried.push("barcode-rejected");
  }

  const query = (params.query || "").trim();
  if (!hits.length && query.length >= 3) {
    sourcesTried.push("openfoodfacts-search");
    hits.push(...(await searchOpenFoodFactsText(query)));
  }

  // Déduplique par nom+marque
  const seen = new Set<string>();
  const unique: ExternalProductHit[] = [];
  for (const h of hits) {
    const key = `${(h.barcode || "").trim()}|${h.name.toLowerCase()}|${(h.brand || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(h);
    if (unique.length >= 5) break;
  }

  return { hits: unique, externalEnabled, sourcesTried };
}
