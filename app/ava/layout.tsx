/**
 * Layout dédié /ava — plein viewport, sans chrome boutique.
 * Évite les mismatches d’hydratation de SiteShell (pathname).
 */
export default function AvaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[60] m-0 overflow-hidden bg-black p-0"
      style={{ width: "100vw", height: "100dvh" }}
    >
      {children}
    </div>
  );
}
