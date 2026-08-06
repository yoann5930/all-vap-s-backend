import type { Prisma } from "@prisma/client";

export interface CatalogFilterParams {
  fabricant?: string;
  gamme?: string;
  saveur?: string;
  fruit?: boolean;
  menthole?: boolean;
  boisson?: boolean;
  dessert?: boolean;
  tabac?: boolean;
  bonbon?: boolean;
  frais?: boolean;
  tresFrais?: boolean;
  sucre?: boolean;
  acidule?: boolean;
  pgvg?: string;
  format?: string;
  nicotine?: string;
  disponibilite?: "in_stock" | "out_of_stock";
}

export const FILTER_LABELS: Record<keyof CatalogFilterParams, string> = {
  fabricant: "Fabricant",
  gamme: "Gamme",
  saveur: "Saveur",
  fruit: "Fruit",
  menthole: "Mentholé",
  boisson: "Boisson",
  dessert: "Dessert",
  tabac: "Tabac",
  bonbon: "Bonbon",
  frais: "Frais",
  tresFrais: "Très frais",
  sucre: "Sucré",
  acidule: "Acidulé",
  pgvg: "PG/VG",
  format: "Format",
  nicotine: "Nicotine",
  disponibilite: "Disponibilité",
};

export function parseCatalogFilters(searchParams: URLSearchParams): CatalogFilterParams {
  const bool = (key: string) => searchParams.get(key) === "true" || searchParams.get(key) === "1";
  return {
    fabricant: searchParams.get("fabricant") || searchParams.get("brand") || undefined,
    gamme: searchParams.get("gamme") || searchParams.get("range") || undefined,
    saveur: searchParams.get("saveur") || searchParams.get("flavor") || undefined,
    fruit: bool("fruit"),
    menthole: bool("menthole") || bool("mint"),
    boisson: bool("boisson") || bool("drink"),
    dessert: bool("dessert") || bool("gourmet"),
    tabac: bool("tabac") || bool("tobacco"),
    bonbon: bool("bonbon") || bool("candy"),
    frais: bool("frais") || bool("fresh"),
    tresFrais: bool("tres_frais"),
    sucre: bool("sucre") || bool("sweet"),
    acidule: bool("acidule") || bool("sour"),
    pgvg: searchParams.get("pgvg") || undefined,
    format: searchParams.get("format") || undefined,
    nicotine: searchParams.get("nicotine") || undefined,
    disponibilite:
      searchParams.get("disponibilite") === "in_stock"
        ? "in_stock"
        : searchParams.get("disponibilite") === "out_of_stock"
          ? "out_of_stock"
          : searchParams.get("inStock") === "true"
            ? "in_stock"
            : undefined,
  };
}

function pgvgToVariantFilter(pgvg: string): Prisma.ProductVariantWhereInput | null {
  switch (pgvg) {
    case "50/50":
      return { OR: [{ pgVgLabel: { contains: "50/50", mode: "insensitive" } }, { pgRatio: 50, vgRatio: 50 }] };
    case "30/70":
      return { OR: [{ pgVgLabel: { contains: "30/70", mode: "insensitive" } }, { pgRatio: 30, vgRatio: 70 }] };
    case "70/30":
      return { OR: [{ pgVgLabel: { contains: "70/30", mode: "insensitive" } }, { pgRatio: 70, vgRatio: 30 }] };
    case "100vg":
      return {
        OR: [
          { pgVgLabel: { contains: "100", mode: "insensitive" } },
          { vgRatio: 100 },
          { pgVgLabel: { contains: "100% VG", mode: "insensitive" } },
        ],
      };
    default:
      return { pgVgLabel: { contains: pgvg, mode: "insensitive" } };
  }
}

export function buildFlavorWhere(filters: CatalogFilterParams): Prisma.ProductFlavorWhereInput | null {
  const clauses: Prisma.ProductFlavorWhereInput[] = [];

  if (filters.saveur) {
    clauses.push({
      OR: [
        { primaryFlavor: { contains: filters.saveur, mode: "insensitive" } },
        { secondaryFlavor: { contains: filters.saveur, mode: "insensitive" } },
        { secondaryFlavor2: { contains: filters.saveur, mode: "insensitive" } },
        { flavors: { has: filters.saveur } },
        { searchKeywords: { contains: filters.saveur, mode: "insensitive" } },
      ],
    });
  }
  if (filters.fruit) clauses.push({ isFruity: true });
  if (filters.menthole) clauses.push({ isMint: true });
  if (filters.boisson) clauses.push({ isDrink: true });
  if (filters.dessert) clauses.push({ isGourmet: true });
  if (filters.tabac) clauses.push({ isTobacco: true });
  if (filters.bonbon) clauses.push({ isCandy: true });
  if (filters.frais) clauses.push({ OR: [{ isFresh: true }, { freshnessLevel: "frais" }] });
  if (filters.tresFrais) clauses.push({ freshnessLevel: "tres_frais" });
  if (filters.sucre) clauses.push({ isSweet: true });
  if (filters.acidule) clauses.push({ isSour: true });

  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0]! : { AND: clauses };
}

export function applyCatalogFiltersToWhere(
  base: Prisma.ProductWhereInput,
  filters: CatalogFilterParams
): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = Array.isArray(base.AND)
    ? [...base.AND]
    : base.AND
      ? [base.AND]
      : [];

  if (filters.fabricant) {
    and.push({
      OR: [
        { brand: { equals: filters.fabricant, mode: "insensitive" } },
        { brandRef: { slug: filters.fabricant } },
        { brandRef: { name: { equals: filters.fabricant, mode: "insensitive" } } },
      ],
    });
  }

  if (filters.gamme) {
    and.push({
      OR: [
        { range: { equals: filters.gamme, mode: "insensitive" } },
        { rangeRef: { slug: filters.gamme } },
        { rangeRef: { name: { equals: filters.gamme, mode: "insensitive" } } },
      ],
    });
  }

  const flavorWhere = buildFlavorWhere(filters);
  if (flavorWhere) {
    and.push({ flavors: { some: flavorWhere } });
  }

  if (filters.nicotine) {
    const mg = parseFloat(filters.nicotine);
    if (!Number.isNaN(mg)) {
      and.push({ variants: { some: { active: true, nicotineMg: mg } } });
    }
  }

  if (filters.pgvg) {
    const variantFilter = pgvgToVariantFilter(filters.pgvg);
    if (variantFilter) {
      and.push({ variants: { some: { active: true, ...variantFilter } } });
    }
  }

  if (filters.format) {
    const raw = filters.format.trim().toLowerCase();
    const ml = parseFloat(raw.replace(/[^\d.]/g, ""));
    if (!Number.isNaN(ml)) {
      and.push({
        OR: [
          { variants: { some: { active: true, capacityMl: ml } } },
          { productType: { equals: `${ml}ml`, mode: "insensitive" } },
          { productType: { equals: String(ml), mode: "insensitive" } },
          { category: { contains: `${ml}ml`, mode: "insensitive" } },
          { name: { contains: `${ml}ml`, mode: "insensitive" } },
        ],
      });
    }
  }

  if (filters.disponibilite === "in_stock") {
    and.push({
      OR: [
        { stock: { gt: 0 } },
        { stockLevels: { some: { availableQuantity: { gt: 0 } } } },
      ],
    });
  } else if (filters.disponibilite === "out_of_stock") {
    and.push({
      AND: [
        { stock: { lte: 0 } },
        {
          NOT: {
            stockLevels: { some: { availableQuantity: { gt: 0 } } },
          },
        },
      ],
    });
  }

  return { ...base, ...(and.length ? { AND: and } : {}) };
}

export function buildEnhancedSearchWhere(search: string): Prisma.ProductWhereInput {
  const terms = search
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const orClauses: Prisma.ProductWhereInput[] = [
    { name: { contains: search, mode: "insensitive" } },
    { description: { contains: search, mode: "insensitive" } },
    { shortDescription: { contains: search, mode: "insensitive" } },
    { longDescription: { contains: search, mode: "insensitive" } },
    { brand: { contains: search, mode: "insensitive" } },
    { range: { contains: search, mode: "insensitive" } },
    { category: { contains: search, mode: "insensitive" } },
    { sku: { contains: search, mode: "insensitive" } },
    { reference: { contains: search, mode: "insensitive" } },
    { barcode: { contains: search, mode: "insensitive" } },
    { normalizedName: { contains: search, mode: "insensitive" } },
    {
      flavors: {
        some: {
          OR: [
            { primaryFlavor: { contains: search, mode: "insensitive" } },
            { secondaryFlavor: { contains: search, mode: "insensitive" } },
            { secondaryFlavor2: { contains: search, mode: "insensitive" } },
            { searchKeywords: { contains: search, mode: "insensitive" } },
            { flavorFamily: { contains: search, mode: "insensitive" } },
          ],
        },
      },
    },
    {
      rangeRef: {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
        ],
      },
    },
  ];

  for (const term of terms) {
    orClauses.push(
      { name: { contains: term, mode: "insensitive" } },
      { brand: { contains: term, mode: "insensitive" } },
      { range: { contains: term, mode: "insensitive" } },
      {
        flavors: {
          some: {
            OR: [
              { primaryFlavor: { contains: term, mode: "insensitive" } },
              { searchKeywords: { contains: term, mode: "insensitive" } },
            ],
          },
        },
      }
    );
  }

  return { OR: orClauses };
}
