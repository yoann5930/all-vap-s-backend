/**
 * Prononciation & noms commerciaux pour la voix AVA.
 * L'écran affiche prix / stock / volume / fabricant / gamme — AVA ne les lit jamais.
 */

/** Prononce e.Tasty comme « i tésti » (jamais e point tasty / eu tasty / é tasty). */
export function pronounceEtasty(text: string): string {
  return text
    .replace(/\be\s*[.·•]\s*tasty\b/gi, "i tésti")
    .replace(/\be[\s-]?tasty\b/gi, "i tésti")
    .replace(/\betasty\b/gi, "i tésti");
}

/**
 * Nom commercial court pour la voix uniquement.
 * Ex. "Bako 50 ml Bankiz e.Tasty" → "Bako"
 *     "Letters A 100 ml" → "Letters A"
 *     "Numbers 7" → "Numbers 7"
 */
export function commercialProductName(rawName: string): string {
  let n = (rawName || "").trim();
  if (!n) return "";

  n = n
    .replace(/\be\s*[.·•]\s*tasty\b/gi, " ")
    .replace(/\be[\s-]?tasty\b/gi, " ")
    .replace(/\betasty\b/gi, " ")
    .replace(/\bby\s+[\w'’.-]+/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*€/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*euros?\b/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*mg(?:\/ml)?\b/gi, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*ml\b/gi, " ")
    .replace(/\b(?:sels?(?:\s+de)?\s+nicotine|nicotine)\b/gi, " ")
    .replace(/\b(?:shortfill|longfill|concentré|concentre)\b/gi, " ");

  // Gammes / fabricants fréquents en suffixe (affichés à l'écran)
  const brandRangeNoise = [
    "bankiz",
    "freezy crush",
    "gang organis[ée]",
    "godfall city",
    "god fall city",
    "golf city",
    "one taste",
    "smoke wars",
    "windy juice",
    "la cueillette de louise",
    "les maxis malins",
    "loly yumy",
    "call me biggy",
    "deep seas",
    "liquidarom",
    "liquide lab",
    "liquideo",
    "biarritz lab",
    "vape 47",
    "enfer",
    "furiosa",
    "swoke",
    "airmust",
    "cookin'?\\s*cloud",
    "eliquid france",
    "t-?juice",
    "the fuu",
    "cloud vapor",
    "raneki",
    "protect",
  ];
  for (const re of brandRangeNoise) {
    n = n.replace(new RegExp(`\\b${re}\\b`, "gi"), " ");
  }

  // Tirets / séparateurs catalogue
  n = n
    .replace(/\s*[-–—|/]\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Si trop vidé, garder le premier token significatif du nom d'origine
  if (!n || n.length < 2) {
    const first = (rawName || "")
      .replace(/\be\s*[.·•]\s*tasty\b/gi, "")
      .replace(/\b\d+\s*ml\b/gi, "")
      .trim()
      .split(/\s+/)[0];
    return first || rawName.trim();
  }

  // Limiter à ~4 mots commerciaux (évite "Bako Bankiz Extra Fresh...")
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length > 4) {
    // Garder Numbers N / Letters X / Force Couleur
    if (/^(numbers|letters|force|twenty)\b/i.test(words[0])) {
      return words.slice(0, 2).join(" ");
    }
    return words.slice(0, 3).join(" ");
  }
  return n;
}

/** Retire prix / stock / volumes accidentellement présents dans un texte oral. */
export function stripCatalogFactsFromSpeech(text: string): string {
  return text
    // Pas de \b après € (symbole non-mot) — sinon « 20,90 €, » n'est pas retiré
    .replace(/\bà\s*\d+(?:[.,]\d+)?\s*(?:€|euros?)?/gi, "")
    .replace(/\b\d+(?:[.,]\d+)?\s*€/gi, "")
    .replace(/\b\d+(?:[.,]\d+)?\s*euros?\b/gi, "")
    .replace(/(?:co[uû]te|prix|tarif)\s*(?:est|de|:)?\s*\d+(?:[.,]\d+)?\s*(?:€|euros?)?/gi, "")
    .replace(/\b(?:ce produit )?co[uû]te\b[^.!?]*[.!?]?/gi, "")
    .replace(/\ble prix est\b[^.!?]*[.!?]?/gi, "")
    .replace(/\b\d+\s*(?:en stock|restant(?:e)?s?|disponible(?:s)?)\b/gi, "")
    .replace(/\b(?:stock|rupture)\s*:?\s*\d+\b/gi, "")
    .replace(/\b\d+(?:[.,]\d+)?\s*ml\b/gi, "")
    .replace(/\s*,\s*,+/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?…])/g, "$1")
    .replace(/^[,.\s]+|[,.\s]+$/g, "")
    .trim();
}
