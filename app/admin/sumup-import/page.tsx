import { AdminSumUpImportClient } from "@/components/admin/AdminSumUpImportClient";

export default function AdminSumUpImportPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Import SumUp (CSV)</h1>
      <p className="mt-1 text-gray-600">
        Simulation obligatoire · stock général unique All Vap&apos;s · aucune quantité inventée
      </p>
      <AdminSumUpImportClient />
    </div>
  );
}
