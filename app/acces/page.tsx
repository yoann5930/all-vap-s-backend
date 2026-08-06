import type { Metadata } from "next";
import Link from "next/link";
import { InventoryServiceWorker } from "@/components/inventory/InventoryServiceWorker";

export const metadata: Metadata = {
  title: "Accès Inventaire All Vap's",
  robots: { index: false, follow: false },
};

/** Page d’atterrissage claire pour téléphone / tunnel HTTPS. */
export default function AccesInventairePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-10 text-gray-900">
      <InventoryServiceWorker />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          All Vap&apos;s
        </p>
        <h1 className="mt-2 text-3xl font-bold">Accès inventaire</h1>
        <p className="mt-2 text-sm text-gray-600">
          Utilisez toujours les adresses officielles figées fournies par Yoann
          (elles ne changent plus).
        </p>
      </div>

      <div className="space-y-3">
        <Link
          href="/login?next=/inventaire"
          className="block rounded-2xl bg-emerald-700 px-4 py-4 text-center text-base font-semibold text-white"
        >
          Employé — Inventaire boutique
        </Link>
        <Link
          href="/login?next=/admin/inventaires"
          className="block rounded-2xl border border-gray-300 bg-white px-4 py-4 text-center text-base font-semibold text-gray-900"
        >
          Yoann — Admin Inventaires
        </Link>
        <Link
          href="/login?next=/admin"
          className="block rounded-2xl border border-gray-200 px-4 py-3 text-center text-sm font-medium text-gray-700"
        >
          Administration générale
        </Link>
      </div>

      <p className="text-xs text-gray-500">
        Identifiants temporaires remis par Yoann. Après connexion vous arrivez
        directement sur l’écran demandé.
      </p>
    </div>
  );
}
