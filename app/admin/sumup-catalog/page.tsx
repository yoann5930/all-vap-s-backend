import { AdminSumUpCatalogClient } from "@/components/admin/AdminSumUpCatalogClient";

export const dynamic = "force-dynamic";

export default function AdminSumUpCatalogPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Catalogue brut SumUp</h1>
      <p className="mt-1 text-gray-600">
        Produits importés en local — validation famille par famille. Aucune écriture SumUp.
      </p>
      <div className="mt-6">
        <AdminSumUpCatalogClient />
      </div>
    </div>
  );
}
