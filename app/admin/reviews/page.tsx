"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Array<{
    id: string; rating: number; comment: string | null; isApproved: boolean;
    product: { name: string }; user: { email: string };
  }>>([]);

  function load() {
    fetch("/api/admin/reviews").then((r) => r.json()).then(setReviews);
  }

  useEffect(() => { load(); }, []);

  async function approve(id: string, isApproved: boolean) {
    await fetch("/api/admin/reviews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isApproved }),
    });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Avis clients</h1>
      <div className="mt-6 space-y-4">
        {reviews.map((r) => (
          <div key={r.id} className="rounded-lg border p-4">
            <div className="flex justify-between">
              <div>
                <p className="font-medium">{r.product.name}</p>
                <p className="text-sm text-gray-500">{r.user.email} — {"★".repeat(r.rating)}</p>
                {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
              </div>
              {!r.isApproved && (
                <Button size="sm" onClick={() => approve(r.id, true)}>Approuver</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
