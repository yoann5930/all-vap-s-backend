import { AdminCatalogClient } from "@/components/admin/AdminCatalogClient";

export default function AdminCatalogPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Catégories & Marques</h1>
      <p className="mt-1 text-gray-600">Gestion du catalogue All Vap&apos;s</p>
      <AdminCatalogClient />
    </div>
  );
}
