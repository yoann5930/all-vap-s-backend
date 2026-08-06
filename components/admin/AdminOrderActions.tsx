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
  const [trackingInput, setTrackingInput] = useState(trackingNumber || "");

  async function run(
    action: "prepare" | "mark_prepared" | "ship" | "at_relay" | "deliver" | "cancel"
  ) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          action,
          trackingNumber: trackingInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Erreur");
        return;
      }
      if (data.trackingNumber) {
        setLocalTracking(data.trackingNumber);
        setTrackingInput(data.trackingNumber);
      }
      if (data.status) setLocalStatus(data.status);
      const labels: Record<string, string> = {
        prepare: "Préparation démarrée",
        mark_prepared: "Commande préparée",
        ship: "Commande expédiée",
        at_relay: "Disponible en point relais",
        deliver: "Commande livrée",
        cancel: "Commande annulée",
      };
      setMsg(labels[action] || "OK");
    } catch {
      setMsg("Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  const showTracking =
    localStatus === "PAID" ||
    localStatus === "PREPARING" ||
    localStatus === "PREPARED";

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {showTracking && (
        <input
          type="text"
          value={trackingInput}
          onChange={(e) => setTrackingInput(e.target.value)}
          placeholder="N° de suivi transporteur (obligatoire pour expédier)"
          className="min-w-[240px] w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {localStatus === "PAID" && (
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => run("prepare")}>
              Démarrer préparation
            </Button>
            <Button type="button" variant="danger" disabled={busy} onClick={() => run("cancel")}>
              Annuler
            </Button>
          </>
        )}
        {localStatus === "PREPARING" && (
          <>
            <Button type="button" disabled={busy} onClick={() => run("mark_prepared")}>
              Marquer préparée
            </Button>
            <Button type="button" variant="danger" disabled={busy} onClick={() => run("cancel")}>
              Annuler
            </Button>
          </>
        )}
        {localStatus === "PREPARED" && (
          <>
            <Button type="button" disabled={busy} onClick={() => run("ship")}>
              Expédier
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => run("at_relay")}>
              Point relais / retrait
            </Button>
            <Button type="button" variant="danger" disabled={busy} onClick={() => run("cancel")}>
              Annuler
            </Button>
          </>
        )}
        {localStatus === "SHIPPED" && (
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => run("at_relay")}>
              Arrivée point relais
            </Button>
            <Button type="button" disabled={busy} onClick={() => run("deliver")}>
              Marquer livrée
            </Button>
          </>
        )}
        {localStatus === "AT_RELAY" && (
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
    </div>
  );
}
