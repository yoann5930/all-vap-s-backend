import { AdminCatalogImagesClient } from "@/components/admin/AdminCatalogImagesClient";

export default function AdminCatalogImagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Images catalogue</h1>
        <p className="mt-1 text-sm text-gray-600">
          Gestion des photos produit — bouteille seule · prêt pour les livraisons Yoann
        </p>
      </div>
      <AdminCatalogImagesClient />
    </div>
  );
}
