"use client";

import { useEffect, useState } from "react";

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Array<{
    id: string; email: string; firstName: string | null; lastName: string | null;
    loyaltyPoints: number; _count: { orders: number }; createdAt: string;
  }>>([]);

  useEffect(() => {
    fetch("/api/admin/customers").then((r) => r.json()).then(setCustomers);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Clients</h1>
      <p className="mt-1 text-gray-600">{customers.length} client(s)</p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="py-3">Client</th>
              <th className="py-3">Email</th>
              <th className="py-3">Commandes</th>
              <th className="py-3">Points</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="py-3">{c.firstName} {c.lastName}</td>
                <td className="py-3">{c.email}</td>
                <td className="py-3">{c._count.orders}</td>
                <td className="py-3">{c.loyaltyPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
