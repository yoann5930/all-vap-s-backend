"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type CustomerHit = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  loyaltyPoints: number;
  qrCode: string;
  fideleAToutMemberId: string | null;
  fideleAToutBarcode: string | null;
  fideleAToutSyncStatus: string | null;
  loyaltyLedger: Array<{
    delta: number;
    balanceAfter: number;
    reason: string;
    source: string;
    createdAt: string;
  }>;
};

export default function AdminLoyaltyPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [customers, setCustomers] = useState<CustomerHit[]>([]);
  const [fideleMsg, setFideleMsg] = useState("");

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/loyalty/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim() || undefined,
          code: code.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Recherche impossible");
        setCustomers([]);
        return;
      }
      setCustomers(data.customers || []);
      setFideleMsg(data.fideleATout?.message || "");
      if (!(data.customers || []).length) setError("Aucun client trouvé.");
    } catch {
      setError("Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-vap-black">Fidélité & Fidèle à Tout</h1>
        <p className="mt-1 text-sm text-gray-500">
          Recherche boutique par téléphone ou QR / code-barres. Aucun point inventé.
        </p>
      </div>

      <Card>
        <CardBody>
          <form onSubmit={search} className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Téléphone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="06…"
            />
            <Input
              label="QR / code-barres / code membre"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code scanné"
            />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Recherche…" : "Rechercher"}
              </Button>
            </div>
          </form>
          {fideleMsg && <p className="mt-3 text-xs text-gray-500">{fideleMsg}</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </CardBody>
      </Card>

      {customers.map((c) => (
        <Card key={c.id}>
          <CardBody>
            <p className="font-semibold">
              {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}
            </p>
            <p className="text-sm text-gray-500">
              {c.email} · {c.phone || "tél. non renseigné"} · {c.loyaltyPoints} pts
            </p>
            <p className="mt-1 text-xs text-gray-400">
              QR All Vap&apos;s : {c.qrCode}
              {c.fideleAToutMemberId ? ` · FAT ${c.fideleAToutMemberId}` : ""}
              {c.fideleAToutBarcode ? ` · CB ${c.fideleAToutBarcode}` : ""}
              {c.fideleAToutSyncStatus ? ` · sync ${c.fideleAToutSyncStatus}` : ""}
            </p>
            {c.loyaltyLedger?.length > 0 && (
              <ul className="mt-3 divide-y text-sm">
                {c.loyaltyLedger.map((row, i) => (
                  <li key={i} className="flex justify-between py-1">
                    <span className="text-gray-500">
                      {new Date(row.createdAt).toLocaleString("fr-FR")} · {row.reason}
                    </span>
                    <span>
                      {row.delta >= 0 ? "+" : ""}
                      {row.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
