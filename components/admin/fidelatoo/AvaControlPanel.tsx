"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import type { FidelatooStatusSnapshot } from "@/lib/fidelatoo/types";
import {
  APP_LABELS,
  AVA_LABELS,
  StatusBadge,
  VM_LABELS,
  appTone,
  avaTone,
  vmTone,
} from "./StatusBadge";

type Msg = { type: "ok" | "err"; text: string };

async function postAction(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, data, status: res.status };
}

export function AvaControlPanel() {
  const [status, setStatus] = useState<FidelatooStatusSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/fidelatoo/status", { cache: "no-store" });
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (qrUrl) URL.revokeObjectURL(qrUrl);
    };
  }, [qrUrl]);

  async function run(label: string, path: string, body?: unknown) {
    setBusy(label);
    setMsg(null);
    try {
      const { ok, data } = await postAction(path, body);
      setMsg({ type: ok ? "ok" : "err", text: data.message || (ok ? "OK" : "Échec") });
      if (data.status) setStatus(data.status);
      else await refresh();
    } catch {
      setMsg({ type: "err", text: "Erreur réseau" });
    } finally {
      setBusy(null);
    }
  }

  async function revealQr() {
    setBusy("qr");
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/fidelatoo/ava/qr-image?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: err.error || "QR indisponible" });
        setShowQr(false);
        return;
      }
      const blob = await res.blob();
      if (qrUrl) URL.revokeObjectURL(qrUrl);
      const url = URL.createObjectURL(blob);
      setQrUrl(url);
      setShowQr(true);
      setMsg({ type: "ok", text: "QR affiché (durée limitée, non mis en cache)" });
    } catch {
      setMsg({ type: "err", text: "Impossible de charger le QR" });
    } finally {
      setBusy(null);
    }
  }

  function hideQr() {
    setShowQr(false);
    if (qrUrl) {
      URL.revokeObjectURL(qrUrl);
      setQrUrl(null);
    }
  }

  if (!status) {
    return <p className="text-sm text-gray-500">Chargement du panneau Fidelatoo…</p>;
  }

  return (
    <div className="space-y-6">
      {!status.orchestratorConfigured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Orchestrateur VM non configuré sur cet environnement.
          {status.lastError ? ` ${status.lastError}` : ""}
          {" "}Activez <code className="text-xs">FIDELATOO_ORCHESTRATOR_*</code> sur le serveur,
          ou <code className="text-xs">FIDELATOO_ORCHESTRATOR_MOCK=true</code> pour les tests locaux.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-gray-500">VM Android</p>
            <div className="mt-2">
              <StatusBadge label={VM_LABELS[status.vm] || status.vm} tone={vmTone(status.vm)} />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-gray-500">Application Fidelatoo</p>
            <div className="mt-2">
              <StatusBadge label={APP_LABELS[status.app] || status.app} tone={appTone(status.app)} />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-gray-500">Compte A.V.A.</p>
            <div className="mt-2">
              <StatusBadge label={AVA_LABELS[status.ava] || status.ava} tone={avaTone(status.ava)} />
            </div>
            <p className="mt-2 text-xs text-gray-500">{status.avaEmail}</p>
            <p className="mt-1 text-xs text-gray-500">
              Rôle : {status.role === "collaboratrice" ? "Collaboratrice" : status.role}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <h3 className="font-semibold text-gray-900">Machine virtuelle</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!!busy} onClick={() => run("start", "/api/admin/fidelatoo/vm/start")}>
              Démarrer la VM
            </Button>
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run("remote", "/api/admin/fidelatoo/vm/remote-open")}>
              Ouvrir l&apos;accès distant sécurisé
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("restart", "/api/admin/fidelatoo/vm/restart")}>
              Redémarrer
            </Button>
            <Button size="sm" variant="danger" disabled={!!busy} onClick={() => run("stop", "/api/admin/fidelatoo/vm/stop")}>
              Arrêter
            </Button>
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run("app", "/api/admin/fidelatoo/app/open")}>
              Ouvrir Fidelatoo
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h3 className="font-semibold text-gray-900">Compte A.V.A. (Collaboratrice)</h3>
          <p className="text-sm text-gray-600">
            Identité : <strong>{status.avaEmail}</strong> — le mot de passe reste dans le coffre hôte / orchestrateur, jamais ici.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!!busy} onClick={() => run("reg", "/api/admin/fidelatoo/ava/start-registration")}>
              Préparer le compte A.V.A.
            </Button>
            <Button size="sm" disabled={!!busy} onClick={() => run("toqr", "/api/admin/fidelatoo/ava/continue-to-qr")}>
              Aller jusqu&apos;au QR
            </Button>
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void revealQr()}>
              Afficher le QR
            </Button>
            <Button size="sm" disabled={!!busy} onClick={() => { hideQr(); void run("scanned", "/api/admin/fidelatoo/ava/qr-scanned"); }}>
              Confirmer le scan
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("role", "/api/admin/fidelatoo/ava/verify-role")}>
              Vérifier les droits
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("login", "/api/admin/fidelatoo/ava/test-login")}>
              Tester la reconnexion
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => run("hm", "/api/admin/fidelatoo/ava/authorize-store", { store: "HAUTMONT", allow: true })}
            >
              Autoriser Hautmont
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => run("lq", "/api/admin/fidelatoo/ava/authorize-store", { store: "LE_QUESNOY", allow: true })}
            >
              Autoriser Le Quesnoy
            </Button>
            <Button size="sm" variant="danger" disabled={!!busy} onClick={() => run("suspend", "/api/admin/fidelatoo/ava/suspend")}>
              Suspendre A.V.A.
            </Button>
            <Button size="sm" variant="danger" disabled={!!busy} onClick={() => run("revoke", "/api/admin/fidelatoo/ava/revoke")}>
              Révoquer A.V.A.
            </Button>
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run("recover", "/api/admin/fidelatoo/ava/recover")}>
              Récupération sécurisée
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Boutiques accordées : {status.stores.length ? status.stores.join(", ") : "aucune"}
          </p>
        </CardBody>
      </Card>

      {showQr && qrUrl && (
        <Card>
          <CardBody className="flex flex-col items-center gap-3">
            <h3 className="font-semibold">QR collaboratrice A.V.A.</h3>
            <p className="text-sm text-gray-500">Visible uniquement ici · scannable par le compte responsable Fidelatoo</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR code collaboratrice A.V.A." className="h-56 w-56 object-contain" />
            <Button size="sm" variant="ghost" onClick={hideQr}>Masquer le QR</Button>
          </CardBody>
        </Card>
      )}

      {msg && (
        <p className={`text-sm ${msg.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>
          {busy ? `… ${busy} — ` : ""}
          {msg.text}
        </p>
      )}
    </div>
  );
}
