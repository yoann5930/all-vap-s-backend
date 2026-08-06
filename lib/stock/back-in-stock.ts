/**
 * Architecture « Prévenez-moi du retour en stock » — DÉSACTIVÉE.
 * Ne pas activer tant que STOCK_NOTIFY_ENABLED !== true.
 */

export function isBackInStockNotifyEnabled(): boolean {
  return ["1", "true", "yes"].includes(
    (process.env.STOCK_NOTIFY_ENABLED || "false").toLowerCase()
  );
}

export type BackInStockRequest = {
  productId: string;
  variantId?: string | null;
  email: string;
};

export async function requestBackInStockNotify(
  _req: BackInStockRequest
): Promise<{ ok: boolean; message: string }> {
  if (!isBackInStockNotifyEnabled()) {
    return {
      ok: false,
      message: "La notification de retour en stock n'est pas encore disponible.",
    };
  }
  // Futur : persister StockNotifyRequest + e-mail A.V.A. au retour
  return { ok: false, message: "Non implémenté" };
}
