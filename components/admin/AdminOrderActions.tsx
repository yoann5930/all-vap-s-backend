"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  orderId: string;
  status: string;
  trackingNumber?: string | null;
};

export function AdminOrderActions({ orderId, status, trackingNumber }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(status);
  const [localTracking, setLocalTracking] = useState(trackingNumber || "");

  async function run(action: "prepare" | "ship" | "deliver" | "cancel") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Erreur");
        return;
      }
      if (data.trackingNumber) setLocalTracking(data.trackingNumber);
      if (data.status) setLocalStatus(data.status);
      if (action === "prepare") setMsg(`Colis préparé : ${data.trackingNumber}`);
      if (action === "ship") setMsg("Commande expédiée");
      if (action === "deliver") setMsg("Commande livrée");
      if (action === "cancel") setMsg("Commande annulée");
    } catch {
      setMsg("Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
      {localStatus === "PAID" && (
        <>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => run("prepare")}>
            Préparer colis
          </Button>
          <Button type="button" disabled={busy} onClick={() => run("ship")}>
            Expédier
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={() => run("cancel")}>
            Annuler
          </Button>
        </>
      )}
      {localStatus === "SHIPPED" && (
        <Button type="button" disabled={busy} onClick={() => run("deliver")}>
          Marquer livrée
        </Button>
      )}
      {localStatus === "PENDING" && (
        <Button type="button" variant="danger" disabled={busy} onClick={() => run("cancel")}>
          Annuler
        </Button>
      )}
      {localTracking && (
        <span className="text-xs text-gray-500">Suivi : {localTracking}</span>
      )}
      {msg && <span className="text-xs text-brand-700">{msg}</span>}
    </div>
  );
}
