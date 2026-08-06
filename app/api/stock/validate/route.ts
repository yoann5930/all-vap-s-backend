import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { validateCartStock } from "@/lib/stock";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        variantId: z.string().optional().nullable(),
        quantity: z.number().int().positive().max(99),
        name: z.string().optional(),
      })
    )
    .min(1)
    .max(50),
});

/** Contrôle stock panier / pré-checkout — public mais rate-limité. */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const limit = checkRateLimit(`stock-validate:${ip}`, 60, 60_000);
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop de requêtes. Réessayez plus tard.", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    const body = schema.parse(await request.json());
    const result = await validateCartStock(body.items);
    return jsonResponse(result, result.ok ? 200 : 409);
  } catch (error) {
    return handleApiError(error);
  }
}
