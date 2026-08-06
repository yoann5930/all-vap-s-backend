"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { FidelatooStatusSnapshot } from "@/lib/fidelatoo/types";
import {
  APP_LABELS,
  AVA_LABELS,
  StatusBadge,
  VM_LABELS,
  appTone,
  avaTone,
  vmTone,
} from "@/components/admin/fidelatoo/StatusBadge";

export default function FidelatooDashboardPage() {
  const [status, setStatus] = useState<FidelatooStatusSnapshot | null>(null);

  useEffect(() => {
    fetch("/api/admin/fidelatoo/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs text-gray-500">VM Android</p>
            <div className="mt-2">
              <StatusBadge
                label={status ? VM_LABELS[status.vm] || status.vm : "…"}
                tone={status ? vmTone(status.vm) : "idle"}
              />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-gray-500">Fidelatoo</p>
            <div className="mt-2">
              <StatusBadge
                label={status ? APP_LABELS[status.app] || status.app : "…"}
                tone={status ? appTone(status.app) : "idle"}
              />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-gray-500">A.V.A.</p>
            <div className="mt-2">
              <StatusBadge
                label={status ? AVA_LABELS[status.ava] || status.ava : "…"}
                tone={status ? avaTone(status.ava) : "idle"}
              />
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Contrôle A.V.A.</h2>
            <p className="text-sm text-gray-600">
              Démarrage VM, QR collaboratrice, boutiques Hautmont / Le Quesnoy.
            </p>
          </div>
          <Button href="/admin/fidelatoo/ava" size="sm">
            Ouvrir le panneau A.V.A.
          </Button>
        </CardBody>
      </Card>

      <ul className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
        <li>
          <Link className="text-brand-700 hover:underline" href="/admin/fidelatoo/virtual-machine">
            Machine virtuelle →
          </Link>
        </li>
        <li>
          <Link className="text-brand-700 hover:underline" href="/admin/fidelatoo/activity">
            Journal d&apos;activité →
          </Link>
        </li>
        <li>
          <Link className="text-brand-700 hover:underline" href="/admin/fidelatoo/security">
            Sécurité du connecteur →
          </Link>
        </li>
        <li>
          <Link className="text-brand-700 hover:underline" href="/admin/fidelatoo/settings">
            Réglages →
          </Link>
        </li>
      </ul>
    </div>
  );
}
