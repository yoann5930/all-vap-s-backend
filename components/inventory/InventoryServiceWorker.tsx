"use client";

import { useEffect } from "react";

/** Invalide les anciens service workers / caches inventaire (v1–v3). */
export function InventoryServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          // Forcer update du SW enregistré
          try {
            await reg.update();
          } catch {
            /* ignore */
          }
        }

        if (cancelled) return;

        // Nettoyer vieux caches
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((k) => k.startsWith("allvaps-inventory-") && k !== "allvaps-inventory-v5")
              .map((k) => caches.delete(k))
          );
        }

        // Enregistrer le SW courant (scope racine pour couvrir login)
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        /* ignore — inventaire reste utilisable sans SW */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
