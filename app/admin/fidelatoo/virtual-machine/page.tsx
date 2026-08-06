"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import type { FidelatooStatusSnapshot } from "@/lib/fidelatoo/types";
import { StatusBadge, VM_LABELS, vmTone } from "@/components/admin/fidelatoo/StatusBadge";

export default function FidelatooVmPage() {
  const [status, setStatus] = useState<FidelatooStatusSnapshot | null>(null);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/fidelatoo/status", { cache: "no-store" });
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function cmd(path: string) {
    setMsg("");
    const res = await fetch(path, { method: "POST", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setMsg(data.message || (res.ok ? "OK" : "Échec"));
    if (data.status) setStatus(data.status);
    else await refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">État VM Android</h2>
            <StatusBadge
              label={status ? VM_LABELS[status.vm] || status.vm : "…"}
              tone={status ? vmTone(status.vm) : "idle"}
            />
          </div>
          <p className="text-sm text-gray-600">
            La VM reste sur le serveur privé. allvaps.fr ne commande que via l&apos;orchestrateur signé — jamais ADB/Appium/scrcpy exposés.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => cmd("/api/admin/fidelatoo/vm/start")}>Démarrer la VM</Button>
            <Button size="sm" variant="secondary" onClick={() => cmd("/api/admin/fidelatoo/vm/remote-open")}>
              Accès distant sécurisé
            </Button>
            <Button size="sm" variant="outline" onClick={() => cmd("/api/admin/fidelatoo/vm/restart")}>Redémarrer</Button>
            <Button size="sm" variant="danger" onClick={() => cmd("/api/admin/fidelatoo/vm/stop")}>Arrêter</Button>
          </div>
          {msg && <p className="text-sm text-gray-700">{msg}</p>}
        </CardBody>
      </Card>
    </div>
  );
}
