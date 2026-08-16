import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { runAvaCheckup } from "@/lib/ava/health/checkup";
import { getAuthUser } from "@/lib/jwt";
import { resolveAvaAccess } from "@/lib/ava/central-router";

export const dynamic = "force-dynamic";

/**
 * Check-up interne AVA — pas de secrets.
 * Public : OK/DEGRADED/ERROR uniquement, sans compteurs commandes détaillés si non interne.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const only = url.searchParams.get("only");
    const authUser = await getAuthUser().catch(() => null);
    const access = resolveAvaAccess({
      auth: authUser
        ? { authenticated: true, role: authUser.role }
        : { authenticated: false, role: null },
      deviceTokenHeader: req.headers.get("x-ava-device-token"),
    });
    const check = await runAvaCheckup({ only });
    const items =
      access.audience === "internal"
        ? check.items
        : check.items.map((i) =>
            i.module === "Commandes"
              ? { ...i, message: i.status === "OK" ? "service lecture joignable" : i.message }
              : i,
          );
    return jsonResponse({
      ok: true,
      correlationId: check.correlationId,
      audience: access.audience,
      spoken: check.spoken,
      items,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
