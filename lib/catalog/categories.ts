export interface CatalogCategory {
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  group: "materiel" | "liquides" | "diy" | "accessoires";
}

/** Catalogue officiel All Vap's — 16 catégories */
export const CATALOG_CATEGORIES: CatalogCategory[] = [
  {
    name: "Cigarettes électroniques",
    slug: "cigarettes-electroniques",
    description: "Kits et cigarettes électroniques complètes",
    sortOrder: 1,
    group: "materiel",
  },
  {
    name: "Pods",
    slug: "pods",
    description: "Pods systems compacts et performants",
    sortOrder: 2,
    group: "materiel",
  },
  {
    name: "Box",
    slug: "box",
    description: "Box mods simple et double accu",
    sortOrder: 3,
    group: "materiel",
  },
  {
    name: "Mods",
    slug: "mods",
    description: "Mods électroniques et mécaniques",
    sortOrder: 4,
    group: "materiel",
  },
  {
    name: "Clearomiseurs",
    slug: "clearomiseurs",
    description: "Clearomiseurs et atomiseurs",
    sortOrder: 5,
    group: "materiel",
  },
  {
    name: "Résistances",
    slug: "resistances",
    description: "Coils et résistances pour tous modèles",
    sortOrder: 6,
    group: "materiel",
  },
  {
    name: "E-liquides",
    slug: "e-liquides",
    description: "E-liquides premium toutes saveurs",
    sortOrder: 7,
    group: "liquides",
  },
  {
    name: "DIY",
    slug: "diy",
    description: "Matériel et produits pour fabriquer son e-liquide",
    sortOrder: 8,
    group: "diy",
  },
  {
    name: "Arômes",
    slug: "aromes",
    description: "Arômes concentrés pour DIY",
    sortOrder: 9,
    group: "diy",
  },
  {
    name: "Bases",
    slug: "bases",
    description: "Bases neutres PG/VG pour DIY",
    sortOrder: 10,
    group: "diy",
  },
  {
    name: "Boosters",
    slug: "boosters",
    description: "Boosters de nicotine",
    sortOrder: 11,
    group: "diy",
  },
  {
    name: "Accessoires",
    slug: "accessoires",
    description: "Accessoires vape et entretien",
    sortOrder: 12,
    group: "accessoires",
  },
  {
    name: "Batteries",
    slug: "batteries",
    description: "Accus 18650, 21700 et adaptateurs",
    sortOrder: 13,
    group: "accessoires",
  },
  {
    name: "Chargeurs",
    slug: "chargeurs",
    description: "Chargeurs intelligents pour accu",
    sortOrder: 14,
    group: "accessoires",
  },
  {
    name: "Verres",
    slug: "verres",
    description: "Pyrex et verres de remplacement",
    sortOrder: 15,
    group: "accessoires",
  },
  {
    name: "Drip Tips",
    slug: "drip-tips",
    description: "Drip tips 510 et 810",
    sortOrder: 16,
    group: "accessoires",
  },
];

export const CATEGORY_GROUPS = [
  { id: "materiel", label: "Matériel" },
  { id: "liquides", label: "E-liquides" },
  { id: "diy", label: "DIY" },
  { id: "accessoires", label: "Accessoires" },
] as const;

export function getCategoryBySlug(slug: string): CatalogCategory | undefined {
  return CATALOG_CATEGORIES.find((c) => c.slug === slug);
}

export function getCategoriesByGroup(group: CatalogCategory["group"]) {
  return CATALOG_CATEGORIES.filter((c) => c.group === group);
}
