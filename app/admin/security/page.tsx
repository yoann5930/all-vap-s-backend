"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function AdminSecurityPage() {
  const [status, setStatus] = useState<{
    mustChangePassword: boolean;
    twoFactorEnabled: boolean;
    configured: boolean;
  } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function refresh() {
    const res = await fetch("/api/admin/security", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status" }),
    });
    if (res.ok) setStatus(await res.json());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const res = await fetch("/api/admin/security", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Échec");
      return;
    }
    setMsg("Mot de passe mis à jour.");
    setCurrentPassword("");
    setNewPassword("");
    await refresh();
  }

  async function setup2fa() {
    setErr("");
    const res = await fetch("/api/admin/security", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setup" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Échec");
      return;
    }
    setQr(data.qrImageUrl);
    setSecret(data.secret);
  }

  async function enable2fa() {
    setErr("");
    const res = await fetch("/api/admin/security", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "enable", token: totpToken }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Échec");
      return;
    }
    setMsg("2FA activée.");
    setQr(null);
    setSecret(null);
    setTotpToken("");
    await refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sécurité administrateur</h1>
      {status?.mustChangePassword && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Changement de mot de passe obligatoire avant d&apos;accéder au reste de l&apos;administration.
        </p>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      <Card>
        <CardBody>
          <h2 className="font-semibold">Mot de passe</h2>
          <form onSubmit={changePassword} className="mt-4 grid max-w-md gap-3">
            <Input
              label="Mot de passe actuel"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Input
              label="Nouveau mot de passe (min. 10)"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
            />
            <Button type="submit">Enregistrer</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="font-semibold">Double authentification (TOTP)</h2>
          <p className="mt-1 text-sm text-gray-500">
            Statut : {status?.twoFactorEnabled ? "activée" : "désactivée"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={setup2fa}>
              Configurer / régénérer
            </Button>
          </div>
          {qr && (
            <div className="mt-4 space-y-3">
              <div className="relative h-48 w-48">
                <Image src={qr} alt="QR 2FA" fill unoptimized className="object-contain" />
              </div>
              {secret && (
                <p className="text-xs text-gray-500">
                  Secret (affichage unique) : {secret}
                </p>
              )}
              <Input
                label="Code à 6 chiffres"
                value={totpToken}
                onChange={(e) => setTotpToken(e.target.value)}
              />
              <Button type="button" onClick={enable2fa}>
                Activer la 2FA
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
