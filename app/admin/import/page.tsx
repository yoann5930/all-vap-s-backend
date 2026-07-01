import { AdminImportClient } from "@/components/admin/AdminImportClient";

export default function AdminImportPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Import produits</h1>
      <p className="mt-1 text-gray-600">Importation massive via CSV ou export Excel</p>
      <AdminImportClient />
    </div>
  );
}
