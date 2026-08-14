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

async function fetchText(url: string, timeoutMs = 7000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "text/html",
        "User-Agent": "AllVaps-AVA/1.0 (read-only research)",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function searchWebForAva(query: string, limit = 3): Promise<AvaWebHit[]> {
  const q = query.trim().slice(0, 180);
  if (q.length < 2) return [];
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const html = await fetchText(url);
  if (!html) return [];

  const hits: AvaWebHit[] = [];
  const re =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && hits.length < limit) {
    const href = unwrapDuckHref(match[1]);
    if (!/^https?:\/\//i.test(href)) continue;
    const title = sanitizeWebText(match[2]);
    if (title.length < 3) continue;
    const after = html.slice(match.index, match.index + 1200);
    const snip = after.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const snippet = sanitizeWebText(snip?.[1] || title);
    hits.push({ title, snippet, url: href.slice(0, 300) });
  }
  return hits;
}

export function speakWebHits(query: string, hits: AvaWebHit[]): string {
  if (!hits.length) {
    return "Je n'ai rien trouvé de fiable sur Internet pour le moment.";
  }
  const first = hits[0];
  const extra = hits.length > 1 ? ` J'ai ${hits.length} pistes.` : "";
  return `D'après des sources web, ${first.title}. ${first.snippet}${extra} C'est une info externe, pas une donnée All Vap's.`;
}
