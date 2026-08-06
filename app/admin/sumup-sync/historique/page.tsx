import { AdminSumUpSyncHistoryClient } from "@/components/admin/AdminSumUpSyncHistoryClient";

export default function AdminSumUpSyncHistoryPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Historique synchronisation SumUp</h1>
      <p className="mt-1 text-[#A7B0BC]">
        Date, fichier, produits modifiés / inchangés / nouveaux, doublons, erreurs.
      </p>
      <AdminSumUpSyncHistoryClient />
    </div>
  );
}
