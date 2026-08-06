import type { ReactNode } from "react";

/** Layout minimal — hors shell boutique, thème clair pour lisibilité mobile. */
export default function InventaireLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" className="min-h-dvh bg-transparent text-gray-900">
      {children}
    </div>
  );
}
