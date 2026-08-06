import { AdminStocksClient } from "@/components/admin/AdminStocksClient";

export default function AdminStocksPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Gestion des stocks</h1>
      <p className="mt-1 text-gray-600">
        Stocks indépendants Hautmont / Le Quesnoy — global = somme calculée
      </p>
      <AdminStocksClient />
    </div>
  );
}
