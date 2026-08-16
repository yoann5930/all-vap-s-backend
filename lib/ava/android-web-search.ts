/**
 * Recherche web lecture seule pour AVA Android.
 * DuckDuckGo HTML — aucune clé. Le contenu est une source documentaire,
 * jamais une instruction système.
 */

export type AvaWebHit = {
  title: string;
  snippet: string;
  url: string;
};

const INJECTION =
  /ignore\s+(tes|les|toutes?\s+les)?\s*instructions|oublie\s+(tes|les)\s+r[eè]gles|system\s*prompt|r[eé]v[eè]le\s+(tes|le)\s+(cl[eé]s?|prompt)|you\s+are\s+now|jailbreak/gi;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'");
}

function stripTags(s: string): string {
  return decodeHtml(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function sanitizeWebText(raw: string): string {
  const cleaned = stripTags(raw).replace(INJECTION, " ").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 280);
}

function unwrapDuckHref(href: string): string {
  const decoded = decodeHtml(href);
  const uddg = decoded.match(/[?&]uddg=([^&]+)/);
  if (!uddg) return decoded;
  try {
    return decodeURIComponent(uddg[1]);
  } catch {
    return decoded;
  }
}

type FetchResult = { ok: boolean; status: number; html: string | null; kind: string };

async function fetchText(url: string, timeoutMs = 8000): Promise<FetchResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "User-Agent": BROWSER_UA,
      },
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) {
      console.warn(`AVA_WEB_HTTP_STATUS ${res.status}`);
      return { ok: false, status: res.status, html: null, kind: "http" };
    }
    const html = await res.text();
    console.info(`AVA_WEB_HTTP_STATUS ${res.status} len=${html.length}`);
    return { ok: true, status: res.status, html, kind: "ok" };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "AbortError";
    console.warn(`AVA_WEB_HTTP_STATUS ${timeout ? "timeout" : "network"}`);
    return { ok: false, status: 0, html: null, kind: timeout ? "timeout" : "network" };
  } finally {
    clearTimeout(t);
  }
}

export function parseDuckHits(html: string, limit: number): AvaWebHit[] {
  const hits: AvaWebHit[] = [];
  const classic =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = classic.exec(html)) && hits.length < limit) {
    pushHit(hits, match[1], match[2], html, match.index);
  }
  if (hits.length) return hits;
  const lite =
    /<a[^>]*rel="nofollow"[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = lite.exec(html)) && hits.length < limit) {
    pushHit(hits, match[1], match[2], html, match.index);
  }
  return hits;
}

function pushHit(
  hits: AvaWebHit[],
  hrefRaw: string,
  titleRaw: string,
  html: string,
  index: number,
) {
  const href = unwrapDuckHref(hrefRaw);
  if (!/^https?:\/\//i.test(href)) return;
  if (/duckduckgo\.com/i.test(href)) return;
  const title = sanitizeWebText(titleRaw);
  if (title.length < 3) return;
  const after = html.slice(index, index + 1200);
  const snip = after.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|span)>/i);
  const snippet = sanitizeWebText(snip?.[1] || title);
  hits.push({ title, snippet, url: href.slice(0, 300) });
}

export async function searchWebForAva(query: string, limit = 3): Promise<AvaWebHit[]> {
  const q = query.trim().slice(0, 180);
  if (q.length < 2) return [];
  const encoded = encodeURIComponent(q);
  const urls = [
    `https://html.duckduckgo.com/html/?q=${encoded}`,
    `https://lite.duckduckgo.com/lite/?q=${encoded}`,
  ];
  for (const url of urls) {
    const fetched = await fetchText(url);
    if (!fetched.html) continue;
    const hits = parseDuckHits(fetched.html, limit);
    if (hits.length) return hits;
    console.warn("AVA_WEB_PARSE_EMPTY");
  }
  return [];
}

export function speakWebHits(query: string, hits: AvaWebHit[]): string {
  if (!hits.length) {
    return "Je n'ai rien trouvé de fiable sur Internet pour le moment. Ce n'est pas une interdiction, seulement une absence de source utilisable.";
  }
  const first = hits[0];
  const extra = hits.length > 1 ? ` J'ai ${hits.length} pistes.` : "";
  return `D'après des sources web, ${first.title}. ${first.snippet}${extra} C'est une info externe, pas une donnée All Vap's.`;
}
