import { jsonResponse } from "@/lib/api-utils";
import { SHIPPING_OPTIONS } from "@/lib/shipping";

/** Options de livraison publiques (frais + délais). */
export async function GET() {
  return jsonResponse({
    options: SHIPPING_OPTIONS.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description,
      priceCents: o.priceCents,
      estimatedDays: o.estimatedDays,
    })),
  });
}
