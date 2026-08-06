import { AdminStocksClient } from "@/components/admin/AdminStocksClient";

export default function AdminStocksPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">État des stocks</h1>
      <p className="mt-1 text-gray-600">
        Stock SumUp, ruptures, synchronisation et journal
      </p>
      <AdminStocksClient />
    </div>
  );
}
