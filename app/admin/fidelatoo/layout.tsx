import type { Metadata } from "next";
import { FidelatooNav } from "@/components/admin/fidelatoo/FidelatooNav";

export const metadata: Metadata = {
  title: "Fidelatoo VM — Admin All Vap's",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function FidelatooAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Fidelatoo · VM Android · A.V.A.</h1>
        <p className="mt-1 text-sm text-gray-600">
          Panneau privé allvaps.fr — orchestration sécurisée, sans API Fidelatoo publique.
        </p>
      </div>
      <FidelatooNav />
      {children}
    </div>
  );
}
