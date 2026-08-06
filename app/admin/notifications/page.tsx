"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

export default function AdminNotificationsPage() {
  const [data, setData] = useState<{
    settings?: {
      notifications: Record<string, unknown>;
      reports: Record<string, unknown>;
      ownerPhone: {
        countryCode: string;
        nationalNumber: string;
        displayMasked: string;
        validationLabel: string;
        preferredChannel: string;
        deviceModel: string | null;
        primaryDeviceLabel: string | null;
        gatewayDeviceLabel: string | null;
        customName: string | null;
      };
    };
    providers?: Record<string, { label: string; configured?: boolean }>;
    history?: Array<Record<string, unknown>>;
    devices?: Array<Record<string, unknown>>;
    alerts?: Array<Record<string, unknown>>;
    smsOutbox?: Array<Record<string, unknown>>;
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/notifications");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!data?.settings) return;
    const res = await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notifications: data.settings.notifications,
        reports: data.settings.reports,
        ownerPhone: {
          countryCode: data.settings.ownerPhone.countryCode,
          nationalNumber: data.settings.ownerPhone.nationalNumber,
          preferredChannel: data.settings.ownerPhone.preferredChannel,
          deviceModel: data.settings.ownerPhone.deviceModel,
          primaryDeviceLabel: data.settings.ownerPhone.primaryDeviceLabel,
          gatewayDeviceLabel: data.settings.ownerPhone.gatewayDeviceLabel,
          customName: data.settings.ownerPhone.customName,
        },
      }),
    });
    setMsg(res.ok ? "Enregistré" : "Erreur");
    await load();
  }

  async function testEvent() {
    await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testEvent: true }),
    });
    setMsg("Événement MODE TEST créé");
    await load();
  }

  async function revoke(id: string) {
    await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revokeDeviceId: id }),
    });
    await load();
  }

  if (!data?.settings) {
    return <p className="admin-muted p-6">Chargement…</p>;
  }

  const n = data.settings.notifications as Record<string, boolean | number | string | null>;
  const r = data.settings.reports as Record<string, boolean | number | string>;
  const phone = data.settings.ownerPhone;

  return (
    <div className="admin-page max-w-5xl">
      <header className="mb-6">
        <p className="admin-eyebrow">Paramètres</p>
        <h1 className="admin-h1">Notifications</h1>
        <p className="admin-muted mt-1">
          Bus multi-canal prêt. Push / SMS / passerelle Android : architecture seule tant que non configurés.
        </p>
      </header>

      {msg && <p className="text-sm mb-3 text-emerald-400">{msg}</p>}

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {Object.entries(data.providers || {}).map(([k, v]) => (
          <div key={k} className="admin-card">
            <p className="text-xs uppercase admin-muted">{k}</p>
            <p className="text-sm mt-1">{v.label}</p>
          </div>
        ))}
      </div>

      <section className="admin-card mb-4 space-y-3">
        <h2 className="font-semibold">Canaux & alertes</h2>
        {(
          [
            ["enabled", "Activation générale"],
            ["adminChannel", "Administration"],
            ["emailChannel", "E-mail"],
            ["pushChannel", "Push (si provider)"],
            ["smsChannel", "SMS (si provider)"],
            ["androidGatewayChannel", "Passerelle Android"],
            ["alertNewOrder", "Nouvelles commandes"],
            ["alertPayment", "Paiements"],
            ["alertStock", "Stocks"],
            ["alertShipping", "Expéditions"],
            ["alertTechnical", "Techniques"],
            ["alertSecurity", "Sécurité"],
            ["criticalBypassQuietHours", "Critiques hors horaires silencieux"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!n[key]}
              onChange={(e) =>
                setData({
                  ...data,
                  settings: {
                    ...data.settings!,
                    notifications: { ...n, [key]: e.target.checked },
                  },
                })
              }
            />
            {label}
          </label>
        ))}
        <label className="block text-sm">
          Max SMS / jour
          <input
            className="admin-input mt-1"
            type="number"
            value={Number(n.maxSmsPerDay || 20)}
            onChange={(e) =>
              setData({
                ...data,
                settings: {
                  ...data.settings!,
                  notifications: { ...n, maxSmsPerDay: Number(e.target.value) },
                },
              })
            }
          />
        </label>
      </section>

      <section className="admin-card mb-4 space-y-3">
        <h2 className="font-semibold">A.V.A. — Rapports de gestion</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!r.dailyEnabled}
            onChange={(e) =>
              setData({
                ...data,
                settings: {
                  ...data.settings!,
                  reports: { ...r, dailyEnabled: e.target.checked },
                },
              })
            }
          />
          Rapport quotidien actif
        </label>
        <label className="block text-sm">
          Heure (fuseau boutique)
          <input
            className="admin-input mt-1"
            value={String(r.dailyTime || "20:30")}
            onChange={(e) =>
              setData({
                ...data,
                settings: {
                  ...data.settings!,
                  reports: { ...r, dailyTime: e.target.value },
                },
              })
            }
          />
        </label>
        <label className="block text-sm">
          Fuseau
          <input
            className="admin-input mt-1"
            value={String(r.timezone || "Europe/Paris")}
            onChange={(e) =>
              setData({
                ...data,
                settings: {
                  ...data.settings!,
                  reports: { ...r, timezone: e.target.value },
                },
              })
            }
          />
        </label>
        <label className="block text-sm">
          Destinataire
          <input
            className="admin-input mt-1"
            value={String(r.recipientEmail || "")}
            onChange={(e) =>
              setData({
                ...data,
                settings: {
                  ...data.settings!,
                  reports: { ...r, recipientEmail: e.target.value },
                },
              })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!r.pdfEnabled}
            onChange={(e) =>
              setData({
                ...data,
                settings: {
                  ...data.settings!,
                  reports: { ...r, pdfEnabled: e.target.checked },
                },
              })
            }
          />
          PDF actif
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!r.sendEvenWithoutPurchase}
            onChange={(e) =>
              setData({
                ...data,
                settings: {
                  ...data.settings!,
                  reports: { ...r, sendEvenWithoutPurchase: e.target.checked },
                },
              })
            }
          />
          Envoyer même sans achat
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!r.weeklyEnabled}
            onChange={(e) =>
              setData({
                ...data,
                settings: {
                  ...data.settings!,
                  reports: { ...r, weeklyEnabled: e.target.checked },
                },
              })
            }
          />
          Rapport hebdomadaire
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!r.monthlyEnabled}
            onChange={(e) =>
              setData({
                ...data,
                settings: {
                  ...data.settings!,
                  reports: { ...r, monthlyEnabled: e.target.checked },
                },
              })
            }
          />
          Rapport mensuel
        </label>
      </section>

      <section className="admin-card mb-4 space-y-3">
        <h2 className="font-semibold">Téléphone propriétaire</h2>
        <p className="text-sm">
          Affichage : <strong>{phone.displayMasked}</strong> — {phone.validationLabel}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">
            Indicatif
            <input
              className="admin-input mt-1"
              value={phone.countryCode}
              onChange={(e) =>
                setData({
                  ...data,
                  settings: {
                    ...data.settings!,
                    ownerPhone: { ...phone, countryCode: e.target.value },
                  },
                })
              }
            />
          </label>
          <label className="text-sm">
            Numéro national
            <input
              className="admin-input mt-1"
              value={phone.nationalNumber}
              onChange={(e) =>
                setData({
                  ...data,
                  settings: {
                    ...data.settings!,
                    ownerPhone: { ...phone, nationalNumber: e.target.value },
                  },
                })
              }
            />
          </label>
          <label className="text-sm">
            Modèle appareil
            <input
              className="admin-input mt-1"
              value={phone.deviceModel || ""}
              placeholder="ex. Samsung S24 (saisie manuelle)"
              onChange={(e) =>
                setData({
                  ...data,
                  settings: {
                    ...data.settings!,
                    ownerPhone: { ...phone, deviceModel: e.target.value || null },
                  },
                })
              }
            />
          </label>
          <label className="text-sm">
            Nom téléphone principal
            <input
              className="admin-input mt-1"
              value={phone.primaryDeviceLabel || ""}
              onChange={(e) =>
                setData({
                  ...data,
                  settings: {
                    ...data.settings!,
                    ownerPhone: { ...phone, primaryDeviceLabel: e.target.value || null },
                  },
                })
              }
            />
          </label>
          <label className="text-sm">
            Nom passerelle
            <input
              className="admin-input mt-1"
              value={phone.gatewayDeviceLabel || ""}
              onChange={(e) =>
                setData({
                  ...data,
                  settings: {
                    ...data.settings!,
                    ownerPhone: { ...phone, gatewayDeviceLabel: e.target.value || null },
                  },
                })
              }
            />
          </label>
        </div>
      </section>

      <section className="admin-card mb-4">
        <h2 className="font-semibold mb-2">Appareils</h2>
        {(data.devices || []).length === 0 && (
          <p className="text-sm admin-muted">Aucun appareil enregistré. Push / passerelle à connecter plus tard.</p>
        )}
        <ul className="space-y-2 text-sm">
          {(data.devices || []).map((d) => (
            <li key={String(d.id)} className="flex justify-between gap-2">
              <span>
                {String(d.deviceName || d.platform)} · {String(d.deviceModel || "modèle non saisi")} ·{" "}
                {d.isActive ? "actif" : "révoqué"}
                {d.isGateway ? " · passerelle" : ""}
              </span>
              {Boolean(d.isActive) ? (
                <button type="button" className="admin-btn admin-btn-ghost" onClick={() => void revoke(String(d.id))}>
                  Révoquer
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2 mb-6">
        <button type="button" className="admin-btn" onClick={() => void save()}>
          Enregistrer
        </button>
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => void testEvent()}>
          MODE TEST — événement
        </button>
        <Link href="/admin/rapports" className="admin-btn admin-btn-ghost">
          Rapports
        </Link>
        <Link href="/admin/notifications/historique" className="admin-btn admin-btn-ghost">
          Historique
        </Link>
      </div>

      <section className="admin-card">
        <h2 className="font-semibold mb-2">Dernières livraisons</h2>
        <div className="overflow-x-auto text-xs">
          <table className="admin-table w-full">
            <thead>
              <tr>
                <th>Date</th>
                <th>Canal</th>
                <th>Statut</th>
                <th>Événement</th>
              </tr>
            </thead>
            <tbody>
              {(data.history || []).map((h) => (
                <tr key={String(h.id)}>
                  <td>{new Date(String(h.createdAt)).toLocaleString("fr-FR")}</td>
                  <td>{String(h.channel)}</td>
                  <td>{String(h.status)}</td>
                  <td>{String((h.event as { title?: string } | undefined)?.title || "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
