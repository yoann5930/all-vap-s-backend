"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { CartItem, getCart, getCartCount } from "@/lib/cart";

interface CartContextValue {
  items: CartItem[];
  cartCount: number;
  refreshCart: () => void;
}

const CartContext = createContext<CartContextValue>({
  items: [],
  cartCount: 0,
  refreshCart: () => {},
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [cartCount, setCartCount] = useState(0);

  const refreshCart = useCallback(() => {
    const cart = getCart();
    setItems(cart);
    setCartCount(getCartCount(cart));
  }, []);

  useEffect(() => {
    refreshCart();
    window.addEventListener("storage", refreshCart);
    window.addEventListener("cart-updated", refreshCart);
    return () => {
      window.removeEventListener("storage", refreshCart);
      window.removeEventListener("cart-updated", refreshCart);
    };
  }, [refreshCart]);

  return (
    <CartContext.Provider value={{ items, cartCount, refreshCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}

export function notifyCartUpdate() {
  window.dispatchEvent(new Event("cart-updated"));
}
