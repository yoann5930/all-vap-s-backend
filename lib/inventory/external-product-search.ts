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
  /** Image catalogue fabricant (URL publique) — jamais stockée côté serveur inventaire. */
  imageUrl?: string | null;
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

/** Cache mémoire court (stabilise les recherches répétées Photo). */
const RESULT_CACHE = new Map<string, { at: number; hits: ExternalProductHit[]; ttl: number }>();
const CACHE_TTL_MS = 90_000;
const EMPTY_CACHE_TTL_MS = 20_000;

function cacheGet(key: string): ExternalProductHit[] | null {
  const row = RESULT_CACHE.get(key);
  if (!row) return null;
  if (Date.now() - row.at > row.ttl) {
    RESULT_CACHE.delete(key);
    return null;
  }
  return row.hits.map((h) => ({ ...h }));
}

function cacheSet(key: string, hits: ExternalProductHit[], ttl = CACHE_TTL_MS) {
  if (RESULT_CACHE.size > 200) {
    const first = RESULT_CACHE.keys().next().value;
    if (first) RESULT_CACHE.delete(first);
  }
  RESULT_CACHE.set(key, { at: Date.now(), hits: hits.map((h) => ({ ...h })), ttl });
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(t);
        resolve(fallback);
      });
  });
}

/** Open Food / Beauty / Products Facts — API publique, sans clé. */
async function lookupOpenFactsBarcode(barcode: string): Promise<ExternalProductHit[]> {
  const cached = cacheGet(`off:${barcode}`);
  if (cached) return cached;

  const hosts = [
    "world.openfoodfacts.org",
    "world.openbeautyfacts.org",
    "world.openproductsfacts.org",
  ];
  const results = await Promise.all(
    hosts.map(async (host) => {
      const data = (await fetchJson(
        `https://${host}/api/v2/product/${encodeURIComponent(barcode)}.json`,
        5000
      )) as { status?: number; product?: Record<string, unknown> } | null;
      if (!data || data.status !== 1 || !data.product) return null;
      const name = pickName(data.product);
      if (!name) return null;
      return {
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
      } satisfies ExternalProductHit;
    })
  );
  const hits = results.filter(Boolean) as ExternalProductHit[];
  // Une seule meilleure source
  const top = hits.slice(0, 1);
  cacheSet(`off:${barcode}`, top);
  return top;
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
              "Tu analyses l'étiquette d'un produit (souvent e-liquide / vape). Réponds UNIQUEMENT en JSON: {\"name\":\"\",\"brand\":\"\",\"range\":\"\",\"barcode\":\"\",\"ocrText\":\"\",\"confidence\":0.0}. Ne invente rien. brand = nom exact du fabricant/marque tel qu'écrit. barcode = EAN si lisible. confidence 0-1.",
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
  brandHint?: string | null;
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
  const query = (params.query || "").trim();
  const brandHint = cleanText(params.brandHint);

  const cacheKey = `ext:${barcode}|${query.toLowerCase()}|${(brandHint || "").toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    sourcesTried.push("cache");
    return { hits: cached, externalEnabled, sourcesTried };
  }

  // 1) EAN → bases publiques
  if (barcode.length >= 8 && isPlausibleBarcode(barcode)) {
    sourcesTried.push("openfacts");
    hits.push(
      ...(await withTimeout(lookupOpenFactsBarcode(barcode), 7000, []))
    );
    if (!hits.length) {
      sourcesTried.push("upcitemdb");
      hits.push(...(await withTimeout(lookupUpcItemDb(barcode), 6000, [])));
    }
  } else if (barcode) {
    sourcesTried.push("barcode-rejected");
  }

  // 2) Sites officiels fabricants (prioritaires pour Photo / OCR)
  let officialAttempted = false;
  if (envFlag("PRODUCT_IDENTIFY_OFFICIAL_SITES", true) && query.length >= 3) {
    sourcesTried.push("official-sites");
    officialAttempted = resolveOfficialBrandTargets(brandHint, query).length > 0;
    if (officialAttempted) {
      const official = await withTimeout(
        searchOfficialManufacturerSites({
          query,
          brandHint,
        }),
        10000,
        []
      );
      hits.unshift(...official);
    }
  }

  // 3) Fallback texte Open Food Facts UNIQUEMENT si pas de marque officielle connue
  if (
    !hits.length &&
    query.length >= 3 &&
    !officialAttempted &&
    !brandHint
  ) {
    sourcesTried.push("openfoodfacts-search");
    hits.push(...(await withTimeout(searchOpenFoodFactsText(query), 6000, [])));
  }

  // Déduplique + priorise official > ean bases
  hits.sort((a, b) => {
    const rank = (h: ExternalProductHit) =>
      h.source.startsWith("official:") ? 0 : h.confidence >= 0.9 ? 1 : 2;
    return rank(a) - rank(b) || b.confidence - a.confidence;
  });

  const seen = new Set<string>();
  const unique: ExternalProductHit[] = [];
  for (const h of hits) {
    const key = `${(h.barcode || "").trim()}|${h.name.toLowerCase()}|${(h.brand || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(h);
    if (unique.length >= 5) break;
  }

  if (unique.length) cacheSet(cacheKey, unique);
  else cacheSet(cacheKey, [], EMPTY_CACHE_TTL_MS);
  return { hits: unique, externalEnabled, sourcesTried };
}

/**
 * Marques vape / e-liquide FR courantes → domaines officiels fabricants.
 * Uniquement sites fabricants / marques (pas de marketplaces).
 * Autorisation client : images utilisées en lecture seule pour identification inventaire.
 */
const OFFICIAL_BRAND_DOMAINS: Array<{ keys: string[]; domains: string[]; brand: string }> = [
  { keys: ["pulp"], domains: ["pulp.fr", "www.pulp.fr", "boutique.pulp.fr"], brand: "Pulp" },
  { keys: ["alfaliquid", "alfa liquid"], domains: ["alfaliquid.com", "www.alfaliquid.com"], brand: "Alfaliquid" },
  {
    keys: ["liquidarom", "liquide arom", "liquid arom"],
    domains: ["liquidarom.com", "www.liquidarom.com"],
    brand: "Liquidarom",
  },
  {
    keys: ["liquidelab", "liquide lab", "liquid lab", "liquidlabs", "liquide labs"],
    domains: ["liquidelab.com", "www.liquidelab.com"],
    brand: "LiquideLab",
  },
  {
    keys: ["e-tasty", "etasty", "e.tasty", "e tasty"],
    domains: ["pro.e-tasty.fr", "e-tasty.fr", "www.e-tasty.fr"],
    brand: "E-Tasty",
  },
  {
    keys: ["juice 66", "juice66", "run 66", "hiro 66", "empire 66"],
    domains: ["vapair.pro", "www.vapair.pro"],
    brand: "Juice 66",
  },
  {
    keys: ["vape 47", "vape47"],
    domains: ["vape47.com", "www.vape47.com"],
    brand: "Vape 47",
  },
  {
    keys: ["le french liquide", "french liquide"],
    domains: ["lefrenchliquide.com", "www.lefrenchliquide.com"],
    brand: "Le French Liquide",
  },
  {
    keys: ["vincent dans les vapes", "vdlv"],
    domains: ["vincentdanslesvapes.com"],
    brand: "Vincent dans les Vapes",
  },
  { keys: ["dinner lady"], domains: ["dinnerlady.com", "www.dinnerlady.com"], brand: "Dinner Lady" },
  {
    keys: ["vampire vape"],
    domains: ["vampirevape.co.uk", "www.vampirevape.co.uk"],
    brand: "Vampire Vape",
  },
  { keys: ["capella"], domains: ["capellaflavors.com"], brand: "Capella" },
  { keys: ["vaporesso"], domains: ["vaporesso.com", "www.vaporesso.com"], brand: "Vaporesso" },
  { keys: ["geekvape", "geek vape"], domains: ["geekvape.com", "www.geekvape.com"], brand: "GeekVape" },
  { keys: ["innokin"], domains: ["innokin.com", "www.innokin.com"], brand: "Innokin" },
  { keys: ["voopoo"], domains: ["voopoo.com", "www.voopoo.com"], brand: "Voopoo" },
  { keys: ["smok"], domains: ["smoktech.com", "www.smoktech.com"], brand: "Smok" },
  { keys: ["lost vape"], domains: ["lostvape.com", "www.lostvape.com"], brand: "Lost Vape" },
  {
    keys: ["petits plaisirs", "les petits plaisirs"],
    domains: ["lespetitsplaisirs.com"],
    brand: "Les Petits Plaisirs",
  },
  { keys: ["curieux"], domains: ["curieux.fr", "www.curieux.fr"], brand: "Curieux" },
  { keys: ["protect"], domains: ["protect.fr"], brand: "Protect" },
  { keys: ["revolute"], domains: ["revolute.fr"], brand: "Revolute" },
  { keys: ["flavour power", "flavor power"], domains: ["flavourpower.com", "www.flavourpower.com"], brand: "Flavour Power" },
  { keys: ["solana"], domains: ["solana-ecig.com", "www.solana-ecig.com"], brand: "Solana" },
  { keys: ["happy liquid", "happyliquide"], domains: ["happyliquide.com"], brand: "Happy Liquide" },
];

function resolveOfficialBrandTargets(
  brandHint: string | null,
  query: string
): Array<{ brand: string; domains: string[] }> {
  const hay = `${brandHint || ""} ${query}`.toLowerCase();
  const found: Array<{ brand: string; domains: string[] }> = [];
  for (const row of OFFICIAL_BRAND_DOMAINS) {
    if (row.keys.some((k) => hay.includes(k))) {
      found.push({ brand: row.brand, domains: row.domains });
    }
  }
  return found.slice(0, 3);
}

async function fetchText(url: string, timeoutMs = 7000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "AllVaps-Inventory/1.0 (+product-identify; official-site-lookup)",
      },
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'");
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Recherche contrôlée sur DuckDuckGo HTML, filtrée `site:domaine-officiel`.
 * Pas de clé API. Résultats hors domaines officiels ignorés.
 */
async function duckDuckGoOfficialSiteSearch(
  query: string,
  domain: string,
  brand: string
): Promise<ExternalProductHit[]> {
  const q = `site:${domain} ${query}`.slice(0, 180);
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const html = await fetchText(url);
  if (!html) return [];

  const hits: ExternalProductHit[] = [];
  // result__a = lien résultat DDG HTML
  const re =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < 3) {
    let href = decodeHtmlEntities(m[1]);
    // DDG wrap : //duckduckgo.com/l/?uddg=<encoded>
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) {
      try {
        href = decodeURIComponent(uddg[1]);
      } catch {
        /* keep */
      }
    }
    let host = "";
    try {
      host = new URL(href).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    const allowed = domain.replace(/^www\./, "");
    if (host !== allowed && !host.endsWith(`.${allowed}`)) continue;

    const title = stripTags(m[2]).slice(0, 160);
    if (!title || title.length < 3 || isJunkProductTitle(title, brand)) continue;
    // Ignore pages génériques / bruit SEO
    if (
      /^(accueil|home|login|compte|panier|cart|www\.|index)$/i.test(title) ||
      /^https?:\/\//i.test(title) ||
      new RegExp(`^${allowed.replace(/\./g, "\\.")}$`, "i").test(title) ||
      /\|?\s*accueil\s*$/i.test(title) ||
      /^www\./i.test(title)
    ) {
      continue;
    }

    hits.push({
      name: title,
      brand,
      range: null,
      barcode: null,
      sku: null,
      source: `official:${allowed}`,
      confidence: 0.9,
      rawHints: [title, brand, href],
    });
  }
  return hits;
}

function tokensMatchScore(title: string, query: string): number {
  const t = title.toLowerCase();
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9àâäéèêëïîôùûüç+]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);
  if (!words.length) return 0;
  let hit = 0;
  for (const w of words) {
    if (t.includes(w)) hit += 1;
  }
  return hit / words.length;
}

function absoluteUrl(href: string, domain: string): string | null {
  try {
    if (!href || href.startsWith("data:")) return null;
    if (href.startsWith("//")) return `https:${href}`;
    if (href.startsWith("http")) return href;
    const host = domain.replace(/^www\./, "");
    if (href.startsWith("/")) return `https://www.${host}${href}`;
    return `https://www.${host}/${href}`;
  } catch {
    return null;
  }
}

/** Extrait une image produit depuis un bloc HTML (Prestashop / JSON-LD). */
function extractImageFromBlock(block: string, domain: string): string | null {
  const candidates = [
    block.match(/data-full-size-image-url\s*=\s*["']([^"']+)["']/i)?.[1],
    block.match(/data-image-large-src\s*=\s*["']([^"']+)["']/i)?.[1],
    block.match(/data-src\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i)?.[1],
    block.match(/src\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i)?.[1],
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (/logo|icon|sprite|placeholder|lazy|blank|menu_icon/i.test(c)) continue;
    const abs = absoluteUrl(c, domain);
    if (abs) return abs;
  }
  return null;
}

/** Titres génériques / pages non produit (à ignorer). */
function isJunkProductTitle(title: string, brand: string): boolean {
  const t = title.trim();
  if (t.length < 5) return true;
  if (
    /catalogue|commandes?|accueil|home|login|compte|panier|cart|contact|livraison|mentions|cgv|blog|fabricant|depuis\s+\d{4}|flavors?\s*$|\.pdf\b|^pdf\b/i.test(
      t
    )
  ) {
    return true;
  }
  const lower = t.toLowerCase();
  const brandLower = brand.toLowerCase();
  if (lower === brandLower) return true;
  // "Marque — slogan" / "Marque - Accueil"
  if (
    lower.startsWith(brandLower) &&
    /^[-–—:]/.test(t.slice(brand.length).trim())
  ) {
    return true;
  }
  return false;
}

/** Extrait des produits depuis HTML (JSON-LD + liens produit Prestashop/Shopify-like). */
function parseOfficialHtmlProducts(
  html: string,
  brand: string,
  domain: string,
  query: string
): ExternalProductHit[] {
  const hits: ExternalProductHit[] = [];
  const seen = new Set<string>();

  // JSON-LD Product / ItemList
  const ldRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ld: RegExpExecArray | null;
  while ((ld = ldRe.exec(html))) {
    try {
      const raw = JSON.parse(ld[1]);
      const nodes = Array.isArray(raw) ? raw : [raw];
      for (const node of nodes) {
        const graph = node["@graph"];
        const list = Array.isArray(graph) ? graph : [node];
        for (const item of list) {
          const type = String(item["@type"] || "");
          if (!/Product/i.test(type)) continue;
          const name = cleanText(item.name as string);
          if (!name) continue;
          if (isJunkProductTitle(name, brand)) continue;
          if (tokensMatchScore(name, query) < 0.34) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const brandField = item.brand;
          const brandName =
            typeof brandField === "string"
              ? cleanText(brandField)
              : cleanText(
                  brandField && typeof brandField === "object"
                    ? String((brandField as { name?: string }).name || "")
                    : ""
                );
          hits.push({
            name,
            brand: brandName || brand,
            range: null,
            barcode:
              cleanText(String(item.gtin13 || item.gtin || item.sku || "")) || null,
            sku: cleanText(String(item.sku || "")) || null,
            source: `official:${domain}`,
            confidence: 0.93,
            rawHints: [name, brand],
            imageUrl:
              absoluteUrl(
                String(
                  (Array.isArray(item.image) ? item.image[0] : item.image) ||
                    item.thumbnailUrl ||
                    ""
                ),
                domain
              ) || null,
          });
        }
      }
    } catch {
      /* ignore bad json-ld */
    }
  }

  // Cartes Prestashop product-miniature
  const miniRe =
    /product-miniature[^>]*data-id-product="(\d+)"[\s\S]*?<\/article>/gi;
  let mm: RegExpExecArray | null;
  while ((mm = miniRe.exec(html)) && hits.length < 5) {
    const block = mm[0];
    const titleRaw =
      (block.match(
        /(?:product-title|product-name)[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
      ) ||
        block.match(/<h[23][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
        [])[1] || "";
    const title = stripTags(titleRaw).slice(0, 160);
    if (!title) continue;
    if (isJunkProductTitle(title, brand)) continue;
    // Accepte si au moins un token match OU si la requête est très courte (marque seule)
    const score = tokensMatchScore(title, query);
    if (score < 0.2 && query.trim().split(/\s+/).length > 1) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const rangeGuess =
      title.includes(" - ")
        ? cleanText(title.split(" - ").pop() || "")
        : null;
    const range =
      rangeGuess &&
      rangeGuess.length < 40 &&
      rangeGuess.toLowerCase() !== brand.toLowerCase()
        ? rangeGuess
        : null;
    hits.push({
      name: title,
      brand,
      range,
      barcode: null,
      sku: mm[1] || null,
      source: `official:${domain}`,
      confidence: Math.min(0.95, 0.82 + score * 0.15),
      rawHints: [title, brand],
      imageUrl: extractImageFromBlock(block, domain),
    });
  }

  // Liens titre produit (Prestashop product-title / product-name)
  const linkRe =
    /<a[^>]*href="([^"]+)"[^>]*class="[^"]*(?:product-title|product-name|product__title)[^"]*"[^>]*>([\s\S]*?)<\/a>|<a[^>]*class="[^"]*(?:product-title|product-name|product__title)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(html)) && hits.length < 5) {
    const title = stripTags(lm[2] || lm[4] || "").slice(0, 160);
    if (!title || isJunkProductTitle(title, brand)) continue;
    if (tokensMatchScore(title, query) < 0.34) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      name: title,
      brand,
      range: null,
      barcode: null,
      sku: null,
      source: `official:${domain}`,
      confidence: 0.9,
      rawHints: [title, brand, lm[1] || lm[3] || ""],
      imageUrl: null,
    });
  }

  // Fallback : ancres contenant /product ou /produit
  if (!hits.length) {
    const fallbackRe =
      /<a[^>]*href="([^"]*(?:\/product|\/produit|\/p\/)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let fm: RegExpExecArray | null;
    while ((fm = fallbackRe.exec(html)) && hits.length < 5) {
      const title = stripTags(fm[2] || "").slice(0, 160);
      if (!title || title.length < 4 || isJunkProductTitle(title, brand)) continue;
      if (tokensMatchScore(title, query) < 0.4) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        name: title,
        brand,
        range: null,
        barcode: null,
        sku: null,
        source: `official:${domain}`,
        confidence: 0.86,
        rawHints: [title, brand, fm[1]],
        imageUrl: null,
      });
    }
  }

  return hits.slice(0, 5);
}

/** Recherche directe sur le moteur interne du site officiel (Prestashop / search). */
async function searchOfficialSiteDirect(
  domain: string,
  brand: string,
  query: string
): Promise<ExternalProductHit[]> {
  const host = domain.replace(/^www\./, "");
  const paths = [
    `/recherche?controller=search&s=${encodeURIComponent(query)}`,
    `/fr/recherche?controller=search&s=${encodeURIComponent(query)}`,
    `/search?controller=search&s=${encodeURIComponent(query)}`,
    `/search?q=${encodeURIComponent(query)}`,
    `/search?type=product&q=${encodeURIComponent(query)}`,
    `/?s=${encodeURIComponent(query)}`,
    `/index.php?controller=search&s=${encodeURIComponent(query)}`,
  ];
  const hostsToTry = [`www.${host}`, host];
  for (const base of hostsToTry) {
    for (const path of paths) {
      const html = await fetchText(`https://${base}${path}`);
      if (!html || html.length < 800) continue;
      if (/page not found|404/i.test(html.slice(0, 500)) && html.length < 2000) continue;
      const hits = parseOfficialHtmlProducts(html, brand, host, query);
      if (hits.length) return hits;
    }
  }
  return [];
}

async function searchOfficialManufacturerSites(params: {
  query: string;
  brandHint?: string | null;
}): Promise<ExternalProductHit[]> {
  const targets = resolveOfficialBrandTargets(params.brandHint || null, params.query);
  if (!targets.length) {
    // Pas de marque connue : ne pas scraperer le web ouvert
    return [];
  }

  // Nettoie la requête : enlève la marque déjà connue pour cibler le produit
  let productQuery = params.query;
  for (const t of targets) {
    productQuery = productQuery.replace(new RegExp(t.brand, "ig"), " ");
  }
  productQuery = productQuery.replace(/\s+/g, " ").trim() || params.query;

  const all: ExternalProductHit[] = [];
  for (const t of targets) {
    let found: ExternalProductHit[] = [];
    for (const domain of t.domains) {
      found = await searchOfficialSiteDirect(domain, t.brand, productQuery);
      if (found.length) break;
    }
    if (!found.length) {
      found = await duckDuckGoOfficialSiteSearch(
        productQuery,
        t.domains[0],
        t.brand
      );
    }
    all.push(...found);
    if (all.length >= 5) break;
  }
  return all.slice(0, 5);
}

