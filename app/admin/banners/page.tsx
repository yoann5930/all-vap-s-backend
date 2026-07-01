"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Array<{ id: string; title: string; subtitle: string | null; imageUrl: string; isActive: boolean }>>([]);

  useEffect(() => {
    fetch("/api/admin/promotions?type=banners").then((r) => r.json()).then(setBanners);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Bannières</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {banners.map((b) => (
          <div key={b.id} className="overflow-hidden rounded-xl border">
            <div className="relative h-32">
              <Image src={b.imageUrl} alt={b.title} fill className="object-cover" sizes="400px" />
            </div>
            <div className="p-3">
              <p className="font-medium">{b.title}</p>
              {b.subtitle && <p className="text-sm text-gray-500">{b.subtitle}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
