/**
 * Mémoire métier A.V.A. — culture vape (~15 ans + racines).
 * Chargée depuis data/ava/knowledge/ — pas d'invention catalogue/EAN.
 */
import fs from "node:fs";
import path from "node:path";

export type KnowledgeHit = {
  id: string;
  kind: "faq" | "article" | "timeline";
  title: string;
  content: string;
  score: number;
  tags: string[];
};

type FaqItem = {
  id: string;
  question: string;
  keywords: string[];
  answer: string;
  tags?: string[];
};

type Article = {
  id: string;
  title: string;
  tags: string[];
  keywords: string[];
  content: string;
};

type TimelineEvent = {
  year: number;
  era: string;
  title: string;
  summary: string;
  tags: string[];
};

function loadJson<T>(rel: string, fallback: T): T {
  const p = path.join(process.cwd(), rel);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9àâäéèêëïîôùûüç\s/+.-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let cache: {
  faq: FaqItem[];
  articles: Article[];
  timeline: TimelineEvent[];
} | null = null;

export function loadVapeKnowledge() {
  if (cache) return cache;
  const faq = loadJson<{ faq: FaqItem[] }>("data/ava/knowledge/faq.json", { faq: [] }).faq || [];
  const articles =
    loadJson<{ articles: Article[] }>("data/ava/knowledge/articles.json", { articles: [] }).articles ||
    [];
  const timeline =
    loadJson<{ timeline: TimelineEvent[] }>("data/ava/knowledge/timeline.json", {
      timeline: [],
    }).timeline || [];
  cache = { faq, articles, timeline };
  return cache;
}

/** Détecte une question de culture / technique / histoire vape (hors commande produit pure). */
export function isVapeKnowledgeQuestion(message: string): boolean {
  const n = norm(message);
  if (n.length < 4) return false;

  const intent =
    /\b(c.?est quoi|qu.?est.?ce que|explique|explication|difference|différence|pourquoi|comment|depuis quand|histoire|origine|legislation|législation|loi|interdit|securite|sécurité|pg\b|vg\b|nicotine|sels?|freebase|mtl|dl\b|sub.?ohm|resistance|résistance|coil|mesh|diy|di.?yai|accu|batterie|18650|21700|tpd|debuter|débuter|debutant|débutant|fuite|entretien|inhalation|hit\b|vapeur|cloud|pod\b|clearomiseur|atomiseur|ohm\b|evali|mineur|connaissances?|sais.?tu|tu connais|offre twenty|twenty degress|avant paiement)\b/i.test(
      message,
    );

  const culture =
    /\b(15 ans|evolution|évolution|cigalike|hon lik|sels de nicotine|propylène|propylene|glycerine|glycérine)\b/i.test(
      message,
    );

  return intent || culture;
}

function scoreKeywords(haystack: string, keywords: string[], messageNorm: string): number {
  let score = 0;
  for (const kw of keywords) {
    const k = norm(kw);
    if (!k) continue;
    if (messageNorm.includes(k)) score += k.length > 6 ? 4 : 3;
    else {
      const parts = k.split(" ").filter((p) => p.length > 3);
      const hit = parts.filter((p) => messageNorm.includes(p)).length;
      if (hit && hit === parts.length) score += 2;
      else if (hit) score += 1;
    }
  }
  // bonus si mots du titre/question apparaissent
  for (const token of haystack.split(" ")) {
    if (token.length > 4 && messageNorm.includes(token)) score += 1;
  }
  return score;
}

export function searchVapeKnowledge(message: string, limit = 3): KnowledgeHit[] {
  const { faq, articles, timeline } = loadVapeKnowledge();
  const n = norm(message);
  const hits: KnowledgeHit[] = [];

  for (const f of faq) {
    const score = scoreKeywords(norm(`${f.question} ${f.answer}`), f.keywords, n);
    if (score >= 3) {
      hits.push({
        id: f.id,
        kind: "faq",
        title: f.question,
        content: f.answer,
        score,
        tags: f.tags || [],
      });
    }
  }

  for (const a of articles) {
    const score = scoreKeywords(norm(`${a.title} ${a.content}`), a.keywords, n);
    if (score >= 3) {
      hits.push({
        id: a.id,
        kind: "article",
        title: a.title,
        content: a.content,
        score,
        tags: a.tags || [],
      });
    }
  }

  // Timeline si question historique
  if (/\b(histoire|depuis|origine|evolution|évolution|année|ans|200[0-9]|201[0-9]|202[0-6])\b/.test(n)) {
    const slice = timeline.filter((e) => e.year >= 2011 || /\borigine|invent|hon\b/.test(n));
    const summary = slice
      .slice(0, 8)
      .map((e) => `${e.year} — ${e.title} : ${e.summary}`)
      .join("\n");
    if (summary) {
      hits.push({
        id: "timeline-15",
        kind: "timeline",
        title: "Repères chronologiques vape",
        content: summary,
        score: 8,
        tags: ["histoire"],
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  // dédoublonner par id
  const seen = new Set<string>();
  const out: KnowledgeHit[] = [];
  for (const h of hits) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

export function formatKnowledgeAnswer(hits: KnowledgeHit[]): string {
  if (!hits.length) {
    return "Je n'ai pas d'élément assez précis dans ma mémoire métier sur ce point. Reformulez ou demandez en boutique — et pour un produit précis, indiquez ce que vous cherchez.";
  }
  if (hits.length === 1) {
    const h = hits[0];
    return hits[0].kind === "faq"
      ? h.content
      : `**${h.title}**\n\n${h.content}`;
  }
  const parts = hits.map((h, i) => {
    if (h.kind === "timeline") return `${h.title}\n${h.content}`;
    if (h.kind === "faq") return h.content;
    return `${i + 1}. ${h.title}\n${h.content}`;
  });
  return parts.join("\n\n");
}

export function getKnowledgeStats() {
  const k = loadVapeKnowledge();
  return {
    faq: k.faq.length,
    articles: k.articles.length,
    timelineEvents: k.timeline.length,
    coverage: "2003–2026 (focus 2011–2026)",
  };
}
