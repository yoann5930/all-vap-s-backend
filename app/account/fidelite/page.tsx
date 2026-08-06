"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardBody } from "@/components/ui/Card";

type LedgerRow = {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  source: string;
  orderId: string | null;
  createdAt: string;
};

type LoyaltyData = {
  loyaltyPoints: number;
  qrImageUrl: string;
  qrCode: string;
  memberName: string;
  redeemAvailable: boolean;
  redeemNote: string;
  history: LedgerRow[];
  fideleATout: {
    enabled: boolean;
    configured: boolean;
    syncRequired: boolean;
    message: string;
    syncStatus: string;
    memberId: string | null;
    barcode: string | null;
  };
};

export default function FidelitePage() {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/account/loyalty")
      .then((r) => {
        if (r.status === 401) {
          window.location.href = "/login?redirect=/account/fidelite";
          return null;
        }
        if (!r.ok) throw new Error("load_failed");
        return r.json();
      })
      .then((json) => {
        if (json) setData(json);
      })
      .catch(() => setError("Impossible de charger votre fidélité."));
  }, []);

  if (error) {
    return <div className="py-8 text-red-400">{error}</div>;
  }

  if (!data) return <div className="py-8 text-gray-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Programme fidélité</h2>
      <Card>
        <CardBody className="text-center">
          <p className="text-4xl font-bold text-brand-700">{data.loyaltyPoints}</p>
          <p className="mt-1 text-sm text-gray-500">points All Vap&apos;s</p>
          <p className="mt-4 text-sm text-gray-600">1 € dépensé = 1 point (commandes payées)</p>
          {!data.redeemAvailable && (
            <p className="mt-2 text-xs text-gray-500">{data.redeemNote}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col items-center">
          <h3 className="font-semibold">QR Code personnel — {data.memberName}</h3>
          <p className="mt-1 text-sm text-gray-500">
            Présentez ce QR en boutique. Code : {data.qrCode}
          </p>
          <div className="relative mt-6 h-48 w-48">
            <Image
              src={data.qrImageUrl}
              alt="QR Code fidélité All Vap's"
              fill
              className="object-contain"
              unoptimized
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="font-semibold">Fidèle à Tout</h3>
          <p className="mt-2 text-sm text-gray-600">{data.fideleATout.message}</p>
          <p className="mt-1 text-xs text-gray-500">
            Statut : {data.fideleATout.syncStatus}
            {data.fideleATout.memberId ? ` · Membre ${data.fideleATout.memberId}` : ""}
          </p>
          {data.fideleATout.barcode && (
            <p className="mt-1 text-xs text-gray-500">Code-barres : {data.fideleATout.barcode}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="font-semibold">Historique des points</h3>
          {data.history.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Aucun mouvement pour le moment.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {data.history.map((row) => (
                <li key={row.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-gray-500">
                    {new Date(row.createdAt).toLocaleDateString("fr-FR")} · {row.reason}
                  </span>
                  <span className={row.delta >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {row.delta >= 0 ? "+" : ""}
                    {row.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
