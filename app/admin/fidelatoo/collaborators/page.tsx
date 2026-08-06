"use client";

import { useEffect, useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import type { FidelatooStatusSnapshot } from "@/lib/fidelatoo/types";
import { AVA_LABELS, StatusBadge, avaTone } from "@/components/admin/fidelatoo/StatusBadge";

export default function FidelatooCollaboratorsPage() {
  const [status, setStatus] = useState<FidelatooStatusSnapshot | null>(null);

  useEffect(() => {
    fetch("/api/admin/fidelatoo/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus);
  }, []);

  return (
    <Card>
      <CardBody className="space-y-3">
        <h2 className="font-semibold">Collaborateurs Fidelatoo</h2>
        <p className="text-sm text-gray-600">
          A.V.A. ne peut recevoir que le rôle <strong>Collaboratrice</strong> — jamais Administratrice.
        </p>
        {status && (
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="font-medium">{status.avaEmail}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge label={AVA_LABELS[status.ava] || status.ava} tone={avaTone(status.ava)} />
              <StatusBadge
                label={status.role === "collaboratrice" ? "Collaboratrice" : `Rôle: ${status.role}`}
                tone={status.role === "collaboratrice" ? "ok" : "idle"}
              />
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Boutiques : {status.stores.length ? status.stores.join(", ") : "aucune autorisation"}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
