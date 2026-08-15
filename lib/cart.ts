import { applyCartPromos } from "@/lib/promotions/cart-promos";

export interface CartItem {
  productId: string;
  /** Variante nicotine sélectionnée (obligatoire si le produit a plusieurs dosages) */
  variantId?: string | null;
  name: string;
  slug: string;
  priceCents: number;
  imageUrl?: string | null;
  quantity: number;
  nicotineLabel?: string | null;
  barcode?: string | null;
  sumupProductId?: string | null;
  sumupVariantId?: string | null;
  /** Champs d'éligibilité offre 10 ml (calcul panier client + serveur) */
  category?: string | null;
  productType?: string | null;
  volumeMl?: number | null;
  promotion10mlEligible?: boolean | null;
  /** Offre Twenty (20 ml e.Tasty) — détection sans flag DB */
  brand?: string | null;
  range?: string | null;
  rangeSlug?: string | null;
  productFamily?: string | null;
}

const CART_KEY = "allvaps_cart";

function lineKey(item: { productId: string; variantId?: string | null }): string {
  return `${item.productId}::${item.variantId || ""}`;
}

export function getCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function addToCart(item: Omit<CartItem, "quantity">, quantity = 1): CartItem[] {
  const cart = getCart();
  const key = lineKey(item);
  const existing = cart.find((i) => lineKey(i) === key);

  if (existing) {
    existing.quantity += quantity;
    // Rafraîchir métadonnées offre si présentes
    if (item.promotion10mlEligible != null) {
      existing.promotion10mlEligible = item.promotion10mlEligible;
      existing.volumeMl = item.volumeMl;
      existing.productType = item.productType;
      existing.category = item.category;
    }
    if (item.productFamily != null) existing.productFamily = item.productFamily;
    if (item.rangeSlug != null) existing.rangeSlug = item.rangeSlug;
    if (item.range != null) existing.range = item.range;
    if (item.brand != null) existing.brand = item.brand;
  } else {
    cart.push({ ...item, quantity });
  }

  saveCart(cart);
  return cart;
}

export function updateCartQuantity(
  productId: string,
  quantity: number,
  variantId?: string | null
): CartItem[] {
  const key = lineKey({ productId, variantId });
  const cart = getCart()
    .map((item) => (lineKey(item) === key ? { ...item, quantity } : item))
    .filter((item) => item.quantity > 0);

  saveCart(cart);
  return cart;
}

export function removeFromCart(productId: string, variantId?: string | null): CartItem[] {
  const key = lineKey({ productId, variantId });
  const cart = getCart().filter((item) => lineKey(item) !== key);
  saveCart(cart);
  return cart;
}

export function clearCart(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CART_KEY);
}

export function getCartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}

/** Total après offres 10 ml + Twenty (hors livraison). */
export function getCartPayableTotal(items: CartItem[]): number {
  return applyCartPromos(items).totalCents;
}

export function getCartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
