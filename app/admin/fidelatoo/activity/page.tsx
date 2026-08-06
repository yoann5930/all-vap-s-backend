"use client";

import { useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type LogRow = {
  id: string;
  action: string;
  userEmail: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export default function FidelatooActivityPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const res = await fetch("/api/admin/fidelatoo/audit?take=80", { cache: "no-store" });
    if (!res.ok) {
      setError("Impossible de charger le journal");
      return;
    }
    const data = await res.json();
    setLogs(data.logs || []);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Journal d&apos;activité Fidelatoo</h2>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Actualiser
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Card>
        <CardBody className="space-y-2">
          {logs.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune action journalisée pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {logs.map((log) => (
                <li key={log.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-gray-900">{log.action}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(log.createdAt).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {log.userEmail || "—"} · {log.ip || "ip n/a"}
                    {log.metadata && typeof log.metadata === "object" && "actionId" in log.metadata
                      ? ` · ${String(log.metadata.actionId)}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
