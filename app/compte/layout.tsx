import { AccountSidebar } from "@/components/account/AccountSidebar";

export default function CompteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="premium-section-label">Espace client</p>
      <h1 className="premium-section-title mt-3">Mon compte</h1>
      <p className="premium-section-subtitle">Historique, commandes, fidélité et préférences.</p>
      <div className="mt-10 flex flex-col gap-8 lg:flex-row">
        <div className="lg:w-60">
          <AccountSidebar />
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
