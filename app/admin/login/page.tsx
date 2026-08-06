"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";

function AdminLoginInner() {
  const search = useSearchParams();
  const redirectTo = search.get("redirect") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [need2fa, setNeed2fa] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim(),
          totpToken: totpToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.includes?.("deux facteurs") || res.status === 401 && data.error?.includes?.("2FA")) {
          setNeed2fa(true);
        }
        if (String(data.error || "").toLowerCase().includes("deux facteurs") || data.code === "2FA_REQUIRED") {
          setNeed2fa(true);
        }
        // handleApiError returns message for 2FA_REQUIRED
        if (res.status === 401 && /2FA|deux facteurs|authentification/i.test(data.error || "")) {
          setNeed2fa(true);
        }
        setError(data.error || "Connexion impossible");
        return;
      }

      const { storeAccessToken, confirmSession, clearAccessToken } = await import(
        "@/lib/auth-client"
      );
      const loginToken =
        typeof data.token === "string" && data.token.length > 20 ? data.token : null;
      if (loginToken) storeAccessToken(loginToken);

      const session = await confirmSession(loginToken);
      if (!session.ok || !session.user) {
        clearAccessToken();
        setError(
          session.serverError
            ? `Connexion OK mais lecture session en erreur (HTTP ${session.status}).`
            : `Session non relue par le serveur (HTTP ${session.status}).`
        );
        return;
      }

      const role = session.user.role || data.user?.role;
      if (!["EMPLOYEE", "EMPLOYE", "ADMIN", "PROPRIETAIRE"].includes(role)) {
        setError("Ce compte n'a pas accès à l'administration.");
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
        clearAccessToken();
        return;
      }

      if (session.user.mustChangePassword || data.mustChangePassword || data.user?.mustChangePassword) {
        window.location.assign("/changer-mot-de-passe?next=/admin");
        return;
      }
      window.location.assign(redirectTo.startsWith("/admin") ? redirectTo : "/admin");
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="admin-card w-full max-w-md p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo variant="official" size={48} />
          <h1
            className="mt-5 text-xl font-medium tracking-wide text-[#f2f4f7]"
            style={{ fontFamily: "var(--adm-display)" }}
          >
            Espace sécurisé
          </h1>
          <p className="mt-2 text-sm text-[#8b95a5]">Administration All Vap&apos;s</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-[#8b95a5]">
              E-mail
            </label>
            <input
              className="admin-input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="allvaps70@gmail.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-[#8b95a5]">
              Mot de passe
            </label>
            <input
              className="admin-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {need2fa && (
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-[#8b95a5]">
                Code 2FA
              </label>
              <input
                className="admin-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={totpToken}
                onChange={(e) => setTotpToken(e.target.value)}
                placeholder="6 chiffres"
              />
            </div>
          )}
          {error && (
            <p className="rounded-lg bg-[rgba(239,68,85,0.12)] px-3 py-2 text-sm text-[#ff8a95]">
              {error}
            </p>
          )}
          <button type="submit" className="admin-btn admin-btn-primary w-full" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link href="/mot-de-passe-oublie" className="text-[#8eb6ff] hover:underline">
            Mot de passe oublié
          </Link>
        </p>
      </div>
      <p className="mt-8 text-center text-xs text-[#8b95a5]/70">
        Accès réservé au personnel autorisé · Sessions journalisées
      </p>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-app flex min-h-screen items-center justify-center text-[#8b95a5]">
          Chargement…
        </div>
      }
    >
      <AdminLoginInner />
    </Suspense>
  );
}
