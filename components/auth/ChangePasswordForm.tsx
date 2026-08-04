"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ChangePasswordForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/inventaire";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        return;
      }
      const role = data.user?.role;
      if (role === "ADMIN") {
        window.location.assign(next.startsWith("/") ? next : "/admin");
      } else if (role === "EMPLOYEE") {
        window.location.assign("/inventaire");
      } else {
        window.location.assign(next);
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-md space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-gray-900">Changer le mot de passe</h1>
      <p className="text-sm text-gray-600">
        Pour des raisons de sécurité, vous devez définir un nouveau mot de passe avant de continuer.
      </p>
      <label className="block text-sm">
        Mot de passe temporaire
        <input
          type="password"
          required
          className="mt-1 w-full rounded-xl border px-3 py-2"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      <label className="block text-sm">
        Nouveau mot de passe
        <input
          type="password"
          required
          minLength={8}
          className="mt-1 w-full rounded-xl border px-3 py-2"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      <label className="block text-sm">
        Confirmer
        <input
          type="password"
          required
          minLength={8}
          className="mt-1 w-full rounded-xl border px-3 py-2"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-emerald-700 py-3 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Enregistrement…" : "Enregistrer et continuer"}
      </button>
    </form>
  );
}
