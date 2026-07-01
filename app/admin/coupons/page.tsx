"use client";

import { useEffect, useState } from "react";

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Array<{ code: string; description: string | null; discountType: string; value: number; usedCount: number }>>([]);

  useEffect(() => {
    fetch("/api/admin/promotions").then((r) => r.json()).then(setCoupons);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Coupons</h1>
      <div className="mt-6 space-y-3">
        {coupons.map((c) => (
          <div key={c.code} className="rounded-lg border px-4 py-3">
            <span className="font-mono font-bold text-brand-700">{c.code}</span>
            <span className="ml-3 text-sm text-gray-600">{c.description}</span>
            <span className="ml-3 text-sm">{c.discountType === "PERCENT" ? `${c.value}%` : `${c.value / 100}€`}</span>
            <span className="ml-3 text-xs text-gray-400">{c.usedCount} utilisations</span>
          </div>
        ))}
      </div>
    </div>
  );
}
