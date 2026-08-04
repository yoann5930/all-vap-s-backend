import { AdminInventoryClient } from "@/components/admin/AdminInventoryClient";

export default function AdminInventairePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Inventaire boutique</h1>
      <p className="mt-1 text-gray-600">
        Scan, photo et comptage rattachés à Hautmont ou Le Quesnoy — stock global = somme.
      </p>
      <AdminInventoryClient />
    </div>
  );
}
