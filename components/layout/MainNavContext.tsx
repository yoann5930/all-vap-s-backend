"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MainNavId, ProductNavContext } from "@/lib/navigation/active-main-nav";

type MainNavContextValue = {
  productContext: ProductNavContext | null;
  setProductContext: (ctx: ProductNavContext | null) => void;
};

const MainNavContext = createContext<MainNavContextValue>({
  productContext: null,
  setProductContext: () => undefined,
});

export function MainNavProvider({ children }: { children: ReactNode }) {
  const [productContext, setProductContextState] = useState<ProductNavContext | null>(null);

  const setProductContext = useCallback((ctx: ProductNavContext | null) => {
    setProductContextState(ctx);
  }, []);

  const value = useMemo(
    () => ({ productContext, setProductContext }),
    [productContext, setProductContext]
  );

  return <MainNavContext.Provider value={value}>{children}</MainNavContext.Provider>;
}

export function useMainNavProductContext() {
  return useContext(MainNavContext);
}

/** Pose le contexte nav depuis une fiche produit (nettoyage au démontage). */
export function SetMainNavActive({
  navId,
  productType,
  category,
  manufacturerSlug,
  rangeSlug,
  volumeMl,
}: {
  navId: MainNavId;
  productType?: string | null;
  category?: string | null;
  manufacturerSlug?: string | null;
  rangeSlug?: string | null;
  volumeMl?: number | null;
}) {
  const { setProductContext } = useMainNavProductContext();

  useLayoutEffect(() => {
    setProductContext({
      navId,
      productType,
      category,
      manufacturerSlug,
      rangeSlug,
      volumeMl,
    });
    return () => setProductContext(null);
  }, [
    setProductContext,
    navId,
    productType,
    category,
    manufacturerSlug,
    rangeSlug,
    volumeMl,
  ]);

  return null;
}
