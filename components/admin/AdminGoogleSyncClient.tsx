"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

interface GoogleStatus {
  syncEnabled: boolean;
  driveConfigured: boolean;
  sheetsConfigured: boolean;
  hasEmail: boolean;
  hasPrivateKey: boolean;
  hasDriveFolder: boolean;
  hasSpreadsheet: boolean;
}

export function AdminGoogleSyncClient() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/google/sync");
    const data = await res.json();
    setStatus(data.status || null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function syncSheets() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/google/sync-sheets", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.code || "Sync Sheets impossible");
      }
      setMessage(`Sheets sync OK — ${data.sheets?.join(", ")}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
      await load();
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <p className="font-semibold text-gray-900">Configuration (aucune clé dans le dépôt)</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-600">
          <li>GOOGLE_SYNC_ENABLED : {status?.syncEnabled ? "true" : "false"}</li>
          <li>Service account email : {status?.hasEmail ? "renseigné" : "vide"}</li>
          <li>Private key : {status?.hasPrivateKey ? "renseignée" : "vide"}</li>
          <li>Drive folder : {status?.hasDriveFolder ? "renseigné" : "vide"}</li>
          <li>Sheets spreadsheet : {status?.hasSpreadsheet ? "renseigné" : "vide"}</li>
          <li>Drive prêt : {status?.driveConfigured ? "oui" : "non"}</li>
          <li>Sheets prêt : {status?.sheetsConfigured ? "oui" : "non"}</li>
        </ul>
        <p className="mt-3 text-gray-500">
          Renseigner les variables dans `.env` (voir `.env.example`). Tant qu&apos;elles sont
          vides, les API répondent `GOOGLE_NOT_CONFIGURED` sans planter l&apos;app.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => void syncSheets()} loading={loading}>
          Synchroniser Google Sheets
        </Button>
        <Button type="button" variant="outline" onClick={() => void load()} loading={loading}>
          Rafraîchir le statut
        </Button>
      </div>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-amber-700">{error}</p>}
    </div>
  );
}
