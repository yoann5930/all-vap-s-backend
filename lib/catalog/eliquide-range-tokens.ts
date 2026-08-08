/**
 * Tokens SumUp → slug gamme (certains uniquement, covers déjà présents).
 * Source unique pour classification + apply scripts.
 */
export const CERTAIN_RANGE_TOKENS: Record<
  string,
  Array<{ token: string; rangeSlug: string }>
> = {
  "e-tasty": [
    { token: "inspiration", rangeSlug: "inspiration" },
    { token: "bankiz", rangeSlug: "bankiz" },
    { token: "godfallcity", rangeSlug: "god-fall-city" },
    { token: "god fall city", rangeSlug: "god-fall-city" },
    { token: "freezy crush", rangeSlug: "freezy-crush" },
    { token: "gang organise", rangeSlug: "gang-organise" },
    { token: "smoke wars", rangeSlug: "smoke-wars" },
    { token: "one taste", rangeSlug: "one-taste" },
    { token: "twenty", rangeSlug: "twenty" },
    { token: "letters", rangeSlug: "letters" },
    { token: "numbers", rangeSlug: "numbers" },
  ],
  liquidarom: [
    { token: "ice cool x", rangeSlug: "ice-cool-x" },
    { token: "ice cool", rangeSlug: "ice-cool" },
    { token: "les collegues", rangeSlug: "les-collegues" },
    { token: "les essentiels", rangeSlug: "les-essentiels" },
  ],
  "biarritz-lab": [
    { token: "fruit defendu", rangeSlug: "le-fruit-defendu" },
    { token: "le fruit defendu", rangeSlug: "le-fruit-defendu" },
    { token: "double dragon", rangeSlug: "double-dragon" },
    { token: "mamita", rangeSlug: "mamita" },
  ],
  airmust: [
    { token: "ferox", rangeSlug: "ferox-airmust" },
    { token: "press start", rangeSlug: "press-start-airmust" },
    { token: "unik", rangeSlug: "unik-airmust" },
    { token: "blue hopper", rangeSlug: "blue-hopper-airmust" },
  ],
  swoke: [
    { token: "force vape", rangeSlug: "force-vape-swoke" },
    { token: "bisou", rangeSlug: "bisou-swoke" },
    { token: "saint flava", rangeSlug: "saint-flava-swoke" },
  ],
  "cloud-vapor": [
    { token: "grand taste city", rangeSlug: "grand-taste-city-cloud-vapor" },
  ],
  "vape-47": [
    { token: "furiosa", rangeSlug: "furiosa-eggz" },
    { token: "les fruits d enfer", rangeSlug: "les-fruits-d-enfer" },
    { token: "fruits d enfer", rangeSlug: "les-fruits-d-enfer" },
    { token: "enfer", rangeSlug: "enfer" },
  ],
  "liquide-lab": [
    { token: "kuix", rangeSlug: "kuix" },
    { token: "glagla", rangeSlug: "glagla" },
    { token: "iceberg", rangeSlug: "iceberg" },
    { token: "peche gourmand", rangeSlug: "peche-gourmand" },
    { token: "big kawa", rangeSlug: "big-kawa" },
  ],
  "eliquid-france": [
    { token: "fruizee max", rangeSlug: "fruizee-max-eliquid-france" },
    { token: "mintaia", rangeSlug: "mintaia-eliquid-france" },
    { token: "lemon time", rangeSlug: "lemon-time-eliquid-france" },
  ],
  "aromes-secrets": [
    { token: "mythologie", rangeSlug: "mythologie-aromes-secrets" },
  ],
  avap: [{ token: "devil", rangeSlug: "devil-avap" }],
  "juice-66": [{ token: "66 juice", rangeSlug: "66-juice-juice-66" }],
  liquideo: [
    { token: "dragonz", rangeSlug: "dragonzz-liquideo" },
    { token: "dragonzz", rangeSlug: "dragonzz-liquideo" },
  ],
  "t-juice": [
    { token: "t juice", rangeSlug: "t-juice-50-ml" },
    { token: "tjuice", rangeSlug: "t-juice-50-ml" },
  ],
  "the-fuu": [{ token: "cloud empire", rangeSlug: "cloud-empire-the-fuu" }],
  "cookin-cloud": [{ token: "myst", rangeSlug: "myst" }],
};

/** Fabricants / motifs ambigus → TO_REVIEW (ne pas auto-fusionner). */
export const AMBIGUOUS_REVIEW_PATTERNS: Array<{
  reason: string;
  test: (normName: string) => boolean;
}> = [
  {
    reason: "savourea_vs_aromes_secrets",
    test: (n) => n.includes("savourea") && n.includes("aromes"),
  },
  {
    reason: "fruizee_standalone",
    test: (n) =>
      /\bfruizee\b/.test(n) && !n.includes("fruizee max") && !n.includes("eliquid france"),
  },
  {
    reason: "big_kawa_as_brand",
    test: (n) => n.includes("big kawa") && !n.includes("liquide lab"),
  },
];

export const A_CLASSER_SLUG = "a-classer";
export const A_CLASSER_NAME = "À classer";

export const CLASSIFICATION_STATUSES = [
  "CONFIRMED",
  "AUTO_CLASSIFIED",
  "TO_REVIEW",
  "UNCLASSIFIED",
] as const;

export type ClassificationStatus = (typeof CLASSIFICATION_STATUSES)[number];
