"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { flushOfflineInventoryQueue, queueOfflineInventoryLine } from "@/lib/inventory/offline-queue";

type StoreCode = "HAUTMONT" | "LE_QUESNOY";

interface Session {
  id: string;
  employeeName: string;
  status: string;
  location: { code: string; name: string };
  lines?: Array<{
    id: string;
    barcode: string | null;
    quantityCounted: number;
    product?: { name: string } | null;
    photoPath?: string | null;
  }>;
  _count?: { lines: number };
}

export function AdminInventoryClient() {
  const [employeeName, setEmployeeName] = useState("");
  const [locationCode, setLocationCode] = useState<StoreCode>("HAUTMONT");
  const [session, setSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [barcode, setBarcode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastLineIdRef = useRef<string | null>(null);

  async function lookupBarcode(code: string) {
    try {
      const res = await fetch(`/api/admin/inventory/lookup?barcode=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) return;
      if (data.found) {
        setLookupHint(
          `${data.product.name} — H:${data.product.stockHautmont} · Q:${data.product.stockLeQuesnoy} · Σ:${data.product.stockGlobal}`
        );
      } else {
        setLookupHint("Produit non reconnu — la ligne sera quand même enregistrée");
      }
    } catch {
      setLookupHint(null);
    }
  }

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/admin/inventory/sessions");
    if (!res.ok) return;
    const data = await res.json();
    setSessions(data.sessions || []);
  }, []);

  const refreshSession = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/inventory/sessions/${id}/lines`);
    if (!res.ok) return;
    const data = await res.json();
    setSession(data.session);
  }, []);

  useEffect(() => {
    loadSessions();
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      void flushOfflineInventoryQueue("/api/admin/inventory/sessions");
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    void flushOfflineInventoryQueue("/api/admin/inventory/sessions");
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [loadSessions]);

  async function startSession() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeName, locationCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur session");
      setSession(data.session);
      setMessage(`Session ouverte — ${data.session.location.name}`);
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function addLine() {
    if (!session) return;
    const qty = parseInt(quantity, 10);
    if (!barcode.trim() || isNaN(qty) || qty < 0) {
      setError("Code-barres et quantité requis");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (!navigator.onLine) {
        await queueOfflineInventoryLine({
          sessionId: session.id,
          barcode: barcode.trim(),
          quantityCounted: qty,
        });
        setMessage("Ligne mise en file hors ligne — sync à la reconnexion");
        setBarcode("");
        setQuantity("1");
        return;
      }
      const res = await fetch(`/api/admin/inventory/sessions/${session.id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: barcode.trim(), quantityCounted: qty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur ligne");
      lastLineIdRef.current = data.line.id;
      setMessage(
        data.line.product
          ? `Compté : ${data.line.product.name} × ${qty}`
          : `Code ${barcode} enregistré (non reconnu) × ${qty}`
      );
      setBarcode("");
      setQuantity("1");
      await refreshSession(session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!session) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (lastLineIdRef.current) form.set("lineId", lastLineIdRef.current);
      const res = await fetch(`/api/admin/inventory/sessions/${session.id}/photos`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur photo");
      setMessage(
        data.drive?.uploaded
          ? "Photo enregistrée + Drive"
          : `Photo locale OK (${data.drive?.message || "Drive non configuré"})`
      );
      await refreshSession(session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur photo");
    } finally {
      setLoading(false);
    }
  }

  async function completeSession() {
    if (!session) return;
    const ok = window.confirm(
      `Soumettre l'inventaire ${session.location.name} à validation ?\nLe stock officiel ne sera PAS modifié.`
    );
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/inventory/sessions/${session.id}/complete`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur clôture");
      setMessage(
        data.message ||
          "Session soumise — stock inchangé. Appliquer le stock depuis le détail inventaire."
      );
      setSession(null);
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <div
        className={`rounded-lg px-3 py-2 text-sm ${
          online ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
        }`}
      >
        {online ? "En ligne" : "Hors ligne — les scans sont mis en file d’attente"}
      </div>

      {!session ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <label className="block text-sm">
            <span className="font-medium">Nom employé</span>
            <Input
              className="mt-1"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              placeholder="Prénom Nom"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Boutique</span>
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value as StoreCode)}
            >
              <option value="HAUTMONT">All Vap&apos;s Hautmont</option>
              <option value="LE_QUESNOY">All Vap&apos;s Le Quesnoy</option>
            </select>
          </label>
          <Button
            type="button"
            onClick={() => void startSession()}
            loading={loading}
            disabled={!employeeName.trim()}
          >
            Démarrer l&apos;inventaire
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
            <p className="font-semibold text-brand-900">
              {session.employeeName} · {session.location.name}
            </p>
            <p className="text-brand-800">Session {session.id.slice(0, 8)}… · {session.status}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <label className="block text-sm">
              <span className="font-medium">Scan / code-barres</span>
              <Input
                className="mt-1"
                value={barcode}
                onChange={(e) => {
                  setBarcode(e.target.value);
                  setLookupHint(null);
                }}
                onBlur={() => {
                  if (barcode.trim().length >= 6) void lookupBarcode(barcode.trim());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addLine();
                }}
                placeholder="Scanner ou saisir l’EAN"
                autoFocus
              />
            </label>
            {lookupHint && (
              <p className="text-sm text-gray-600">{lookupHint}</p>
            )}
            <label className="block text-sm">
              <span className="font-medium">Quantité comptée</span>
              <Input
                className="mt-1 w-28"
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void addLine()} loading={loading}>
                Enregistrer la ligne
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                loading={loading}
              >
                Photo
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadPhoto(f);
                }}
              />
              <Button type="button" variant="secondary" onClick={() => void completeSession()} loading={loading}>
                Envoyer à validation
              </Button>
            </div>
          </div>

          <div className="av-contrast-table overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full bg-white text-left text-sm text-black">
              <thead>
                <tr className="border-b bg-gray-50 text-black">
                  <th className="px-3 py-2 font-semibold text-black">Code</th>
                  <th className="px-3 py-2 font-semibold text-black">Produit</th>
                  <th className="px-3 py-2 font-semibold text-black">Qté</th>
                  <th className="px-3 py-2 font-semibold text-black">Photo</th>
                </tr>
              </thead>
              <tbody className="bg-white text-black">
                {(session.lines || []).map((l) => (
                  <tr key={l.id} className="border-b bg-white text-black hover:bg-gray-50">
                    <td className="px-3 py-2 text-black">{l.barcode || "—"}</td>
                    <td className="px-3 py-2 text-black">{l.product?.name || "Non reconnu"}</td>
                    <td className="px-3 py-2 text-black">{l.quantityCounted}</td>
                    <td className="px-3 py-2 text-black">{l.photoPath ? "Oui" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div>
        <h2 className="text-sm font-semibold text-gray-800">Sessions récentes</h2>
        <ul className="mt-2 space-y-2 text-sm text-gray-600">
          {sessions.slice(0, 10).map((s) => (
            <li key={s.id} className="rounded-lg border border-gray-100 px-3 py-2">
              {s.employeeName} · {s.location.name} · {s.status} · {s._count?.lines ?? 0} lignes
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
