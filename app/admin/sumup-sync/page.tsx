import { AdminSumUpSyncDashboard } from "@/components/admin/AdminSumUpSyncDashboard";

export default function AdminSumUpSyncPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Synchronisation SumUp</h1>
      <p className="mt-1 text-[#A7B0BC]">
        Tableau de bord — stock central, connexion, inbox CSV, historique.
      </p>
      <AdminSumUpSyncDashboard />
    </div>
  );
}
