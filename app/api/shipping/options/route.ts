import { jsonResponse } from "@/lib/api-utils";
import { getPublicShippingOptions } from "@/lib/shipping";

/** Options de livraison publiques (La Poste / Colissimo exclus). */
export async function GET() {
  return jsonResponse({
    options: getPublicShippingOptions().map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description,
      priceCents: o.priceCents,
      estimatedDays: o.estimatedDays,
    })),
  });
}
