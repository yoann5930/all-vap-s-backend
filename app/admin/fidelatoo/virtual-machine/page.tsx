"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import type { FidelatooStatusSnapshot } from "@/lib/fidelatoo/types";
import { StatusBadge, VM_LABELS, vmTone } from "@/components/admin/fidelatoo/StatusBadge";

export default function FidelatooVmPage() {
  const [status, setStatus] = useState<FidelatooStatusSnapshot | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/fidelatoo/status", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(data.error || data.message || `Statut HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as FidelatooStatusSnapshot;
      setStatus(data);
      if (data.lastError) setMsg(data.lastError);
      else if (data.orchestratorReachable) {
        setMsg((prev) => (/injoignable|fetch failed|Échec/i.test(prev) ? "" : prev));
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur réseau statut VM");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startStatusPoll() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => void refresh(), 3_000);
    setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 90_000);
  }

  async function cmd(path: string, label: string) {
    setBusy(label);
    setMsg(label === "start" ? "Démarrage demandé…" : "");
    if (label === "start" || label === "restart") startStatusPoll();
    try {
      const res = await fetch(path, { method: "POST", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const message =
        data.message ||
        (res.ok ? "OK" : `Échec HTTP ${res.status}`);
      setMsg(message);
      if (data.status) setStatus(data.status as FidelatooStatusSnapshot);
      else await refresh();
    } catch (e) {
      setMsg(
        e instanceof Error
          ? e.message
          : "Échec réseau vers l'API Admin (pas l'émulateur directement)"
      );
    } finally {
      setBusy(null);
    }
  }

  const vmLabel = status
    ? status.vm === "starting"
      ? "En cours de démarrage"
      : VM_LABELS[status.vm] || status.vm
    : "…";

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">État VM Android</h2>
            <StatusBadge
              label={vmLabel}
              tone={status ? vmTone(status.vm) : "idle"}
            />
            {status && (
              <span className="text-xs text-gray-500">
                Orchestrateur :{" "}
                {status.orchestratorReachable
                  ? "joignable"
                  : status.orchestratorConfigured
                    ? "injoignable"
                    : "non configuré"}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">
            La VM reste sur le serveur privé. allvaps.fr ne commande que via l&apos;orchestrateur
            signé — jamais ADB/Appium/scrcpy exposés.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!!busy}
              onClick={() => cmd("/api/admin/fidelatoo/vm/start", "start")}
            >
              {busy === "start" ? "Démarrage…" : "Démarrer la VM"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!!busy}
              onClick={() => cmd("/api/admin/fidelatoo/vm/remote-open", "remote")}
            >
              Accès distant sécurisé
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => cmd("/api/admin/fidelatoo/vm/restart", "restart")}
            >
              {busy === "restart" ? "Redémarrage…" : "Redémarrer"}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={!!busy}
              onClick={() => cmd("/api/admin/fidelatoo/vm/stop", "stop")}
            >
              {busy === "stop" ? "Arrêt…" : "Arrêter"}
            </Button>
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void refresh()}>
              Actualiser
            </Button>
          </div>
          {msg && (
            <p
              className={`text-sm ${
                /injoignable|échec|error|fetch failed|non /i.test(msg)
                  ? "text-red-600"
                  : "text-gray-700"
              }`}
            >
              {msg}
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
