"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function NotificationHistoryPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    void fetch("/api/admin/notifications")
      .then((r) => r.json())
      .then((d) => setRows(d.history || []));
  }, []);

  return (
    <div className="admin-page">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="admin-h1">Historique des notifications</h1>
          <p className="admin-muted text-sm">Statut « délivré » uniquement avec confirmation fournisseur réelle.</p>
        </div>
        <Link href="/admin/notifications" className="admin-btn admin-btn-ghost">
          Paramètres
        </Link>
      </header>
      <div className="admin-card overflow-x-auto">
        <table className="admin-table w-full text-sm">
          <thead>
            <tr>
              <th>Créé</th>
              <th>Canal</th>
              <th>Destinataire</th>
              <th>Statut</th>
              <th>Provider</th>
              <th>Erreur</th>
              <th>Aperçu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={String(h.id)}>
                <td>{new Date(String(h.createdAt)).toLocaleString("fr-FR")}</td>
                <td>{String(h.channel)}</td>
                <td>{String(h.recipientMasked)}</td>
                <td>{String(h.status)}</td>
                <td>{String(h.provider || "—")}</td>
                <td>{String(h.lastError || "—")}</td>
                <td className="max-w-xs truncate">{String(h.contentPreview || "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
