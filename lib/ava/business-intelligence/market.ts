import { randomBytes } from "crypto";
import type { BiMarketSignal } from "./types";

function id() {
  return `mkt_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

/**
 * Radar marché — sources publiques uniquement.
 * Ne jamais importer un produit automatiquement.
 * Si fetch impossible : missingData explicite.
 */
export async function gatherMarketRadar(): Promise<{
  signals: BiMarketSignal[];
  missingData: string[];
}> {
  const signals: BiMarketSignal[] = [];
  const missingData: string[] = [];
  const now = new Date().toISOString();

  // Signaux internes "à surveiller" dérivés du catalogue (pas du web) — toujours disponibles
  signals.push({
    id: id(),
    category: "catalogue",
    title: "Veille catalogue interne prioritaire",
    information:
      "Surveiller les fabricants/gammes avec beaucoup de produits non classés avant d'ajouter des nouveautés marché.",
    source: "allvaps-internal-catalog-policy",
    date: now,
    confidence: 80,
    importProduct: false,
  });

  // Tentatives de fetch sources officielles (timeout court, no invent)
  const watches: { url: string; title: string; category: BiMarketSignal["category"] }[] = [
    {
      url: "https://www.geekvape.com/",
      title: "Geekvape — site officiel",
      category: "fabricant",
    },
    {
      url: "https://www.voopoo.com/",
      title: "VOOPOO — site officiel",
      category: "fabricant",
    },
  ];

  for (const w of watches) {
    try {
      const res = await fetch(w.url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "AllVaps-AVA-MarketRadar/1.0" },
      });
      if (!res.ok) {
        missingData.push(`market_fetch_${w.title}`);
        continue;
      }
      const html = (await res.text()).slice(0, 4000);
      const hasNew =
        /new\s+arrival|nouveaut|launch|released|coming\s+soon/i.test(html) ||
        /nouveau/i.test(html);
      signals.push({
        id: id(),
        category: w.category,
        title: w.title,
        information: hasNew
          ? "Le site officiel répond et mentionne des nouveautés / lancements. À vérifier manuellement avant toute intégration catalogue."
          : "Site officiel joignable. Aucun signal de nouveauté évident dans l'extrait analysé — pas de conclusion produit.",
        source: w.title,
        sourceUrl: w.url,
        date: now,
        confidence: hasNew ? 45 : 35,
        importProduct: false,
      });
    } catch {
      missingData.push(`market_unreachable_${w.title}`);
    }
  }

  if (missingData.length) {
    signals.push({
      id: id(),
      category: "risque",
      title: "Veille web partielle",
      information:
        "Certaines sources marché n'ont pas pu être lues. Les signaux ci-dessus restent des observations, pas des faits catalogue All Vap's.",
      source: "ava-market-radar",
      date: now,
      confidence: 40,
      importProduct: false,
    });
  }

  return { signals, missingData };
}
