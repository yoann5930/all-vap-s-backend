"use client";

import { useEffect, useState } from "react";

type UserRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  allowedStores: string[];
  lastLoginAt: string | null;
  createdAt: string;
  _count?: { inventorySessions?: number; orders?: number };
};

export function AdminUsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tempPwd, setTempPwd] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "EMPLOYEE",
    allowedStores: ["HAUTMONT", "LE_QUESNOY"] as string[],
  });

  async function load() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Erreur chargement");
      return;
    }
    setUsers(data.users || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createUser() {
    setLoading(true);
    setError("");
    setTempPwd(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setTempPwd(data.temporaryPassword || null);
      setMessage(`Utilisateur ${form.email} créé`);
      setForm({
        email: "",
        firstName: "",
        lastName: "",
        role: "EMPLOYEE",
        allowedStores: ["HAUTMONT", "LE_QUESNOY"],
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function patch(userId: string, body: Record<string, unknown>) {
    setLoading(true);
    setError("");
    setTempPwd(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      if (data.temporaryPassword) setTempPwd(data.temporaryPassword);
      setMessage("Mise à jour enregistrée");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
        <p className="mt-1 text-sm text-gray-600">
          Gestion des comptes inventaire — Yoann uniquement (ADMIN).
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      )}
      {tempPwd && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          Mot de passe temporaire (à transmettre hors Git / logs) :{" "}
          <code className="font-mono font-semibold">{tempPwd}</code>
        </div>
      )}

      <div className="rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Créer un utilisateur</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="EMPLOYEE">EMPLOYEE</option>
            <option value="ADMIN">ADMIN</option>
            <option value="CUSTOMER">CUSTOMER</option>
          </select>
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Prénom"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Nom"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void createUser()}
          className="mt-3 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Créer
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Utilisateur</th>
              <th className="px-3 py-2">Rôle</th>
              <th className="px-3 py-2">Boutiques</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Dernière connexion</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-3 py-3">
                  <div className="font-medium">
                    {u.firstName} {u.lastName}
                  </div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                  <div className="text-xs text-gray-400">
                    Sessions inventaire : {u._count?.inventorySessions ?? 0}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <select
                    className="rounded border px-2 py-1 text-xs"
                    value={u.role}
                    onChange={(e) => void patch(u.id, { role: e.target.value })}
                  >
                    <option value="EMPLOYEE">EMPLOYEE</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="CUSTOMER">CUSTOMER</option>
                  </select>
                </td>
                <td className="px-3 py-3 text-xs">
                  {(u.allowedStores || []).join(", ") || "—"}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                    }`}
                  >
                    {u.active ? "Actif" : "Désactivé"}
                    {u.mustChangePassword ? " · MDP à changer" : ""}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-gray-600">
                  {u.lastLoginAt
                    ? new Date(u.lastLoginAt).toLocaleString("fr-FR")
                    : "Jamais"}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() =>
                        void patch(u.id, {
                          active: !u.active,
                        })
                      }
                    >
                      {u.active ? "Désactiver" : "Réactiver"}
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() => void patch(u.id, { resetPassword: true })}
                    >
                      Reset MDP
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() =>
                        void patch(u.id, {
                          allowedStores: ["HAUTMONT", "LE_QUESNOY"],
                        })
                      }
                    >
                      2 boutiques
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
