"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardBody } from "@/components/ui/Card";

export default function FidelitePage() {
  const [data, setData] = useState<{
    loyaltyPoints: number;
    qrImageUrl: string;
    memberName: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/account/loyalty")
      .then((r) => {
        if (r.status === 401) { window.location.href = "/login"; return null; }
        return r.json();
      })
      .then(setData);
  }, []);

  if (!data) return <div className="py-8 text-gray-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Programme fidélité</h2>
      <Card>
        <CardBody className="text-center">
          <p className="text-4xl font-bold text-brand-700">{data.loyaltyPoints}</p>
          <p className="mt-1 text-sm text-gray-500">points All Vap&apos;s</p>
          <p className="mt-4 text-sm text-gray-600">1€ dépensé = 1 point · 100 points = 1€ de réduction</p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col items-center">
          <h3 className="font-semibold">QR Code personnel — {data.memberName}</h3>
          <p className="mt-1 text-sm text-gray-500">Présentez ce QR en boutique</p>
          <div className="relative mt-6 h-48 w-48">
            <Image src={data.qrImageUrl} alt="QR Code fidélité All Vap's" fill className="object-contain" unoptimized />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
