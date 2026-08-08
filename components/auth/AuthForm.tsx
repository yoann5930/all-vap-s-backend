"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { clearAccessToken, confirmSession, storeAccessToken } from "@/lib/auth-client";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const submittingRef = useRef(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);
    setError("");

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? {
              email: form.email.trim().toLowerCase(),
              password: form.password.trim(),
              next:
                typeof window !== "undefined"
                  ? new URLSearchParams(window.location.search).get("next") ||
                    new URLSearchParams(window.location.search).get("redirect") ||
                    undefined
                  : undefined,
            }
          : {
              email: form.email.trim().toLowerCase(),
              password: form.password,
              firstName: form.firstName.trim(),
              lastName: form.lastName.trim(),
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          typeof data.error === "string" && data.error
            ? data.error
            : "Email ou mot de passe incorrect"
        );
        return;
      }

      const loginToken =
        typeof data.token === "string" && data.token.length > 20 ? data.token : null;

      // Secours Bearer si cookie httpOnly non appliqué — stocké avant le handshake
      if (loginToken) {
        storeAccessToken(loginToken);
      } else {
        clearAccessToken();
      }

      // Handshake : session relue côté serveur (cookie + Bearer du login) avant redirect
      if (mode === "login") {
        if (!loginToken) {
          setError(
            "Connexion refusée : le serveur n’a pas renvoyé de jeton de session. Vérifiez JWT_SECRET sur Vercel."
          );
          return;
        }

        const session = await confirmSession(loginToken);
        if (!session.ok || !session.user) {
          if (session.serverError) {
            // Ne pas effacer le token : le login a réussi, /api/auth/me a planté
            setError(
              session.code === "SESSION_SCHEMA_MISMATCH"
                ? "Connexion OK mais lecture session impossible (schéma serveur). Contactez l’administrateur technique."
                : `Connexion OK mais lecture session en erreur serveur (HTTP ${session.status}). Réessayez dans quelques secondes.`
            );
            return;
          }
          clearAccessToken();
          setError(
            `Connexion acceptée mais session non relue par le serveur (HTTP ${session.status}). Le cookie ou le jeton n’est pas reconnu — ce n’est pas une consigne de réinstallation PWA.`
          );
          return;
        }

        const params = new URLSearchParams(window.location.search);
        const rawNext = params.get("next") || params.get("redirect");
        const next =
          rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

        // Recalcule toujours avec next URL pour ne pas perdre le deep-link autorisé
        const dbRole = session.user.role || data.user?.role || "";
        const appRole =
          (session.user.appRole as "OWNER" | "ADMIN" | "EMPLOYEE" | "CLIENT" | undefined) ||
          (data.user?.appRole as "OWNER" | "ADMIN" | "EMPLOYEE" | "CLIENT" | undefined) ||
          null;
        const mustChange =
          session.user.mustChangePassword ?? data.user?.mustChangePassword;

        const { resolvePostLoginPath, mapDbRoleToAppRoleSync } = await import(
          "@/lib/auth/routing"
        );
        const role =
          appRole ||
          mapDbRoleToAppRoleSync(String(dbRole), {
            isOwnerIdentity: Boolean(
              session.user.isOwnerIdentity ?? data.user?.isOwnerIdentity
            ),
          });

        const computed = resolvePostLoginPath(role, next, {
          mustChangePassword: !!mustChange,
        });
        // Préférer redirect serveur s'il est cohérent ; sinon computed (gère next)
        const serverRedirect =
          typeof data.redirectTo === "string" && data.redirectTo.startsWith("/")
            ? data.redirectTo
            : typeof session.user.redirectTo === "string" &&
                session.user.redirectTo.startsWith("/")
              ? session.user.redirectTo
              : null;

        window.location.assign(
          next ? computed : serverRedirect || computed
        );
        return;
      }

      window.location.assign("/account");
    } catch {
      setError("Erreur de connexion au serveur — vérifiez votre réseau / URL");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardBody>
        <h1 className="text-2xl font-bold text-white">
          {mode === "login" ? "Connexion" : "Créer un compte"}
        </h1>
        {mode === "register" && (
          <p className="mt-1 text-sm text-white/60">Rejoignez la communauté All Vap&apos;s</p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" autoComplete="on">
          {mode === "register" && (
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Prénom"
                name="firstName"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                autoComplete="given-name"
              />
              <Input
                label="Nom"
                name="lastName"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                autoComplete="family-name"
              />
            </div>
          )}
          <Input
            label="Email"
            name="email"
            type="email"
            required
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <div>
            <Input
              label="Mot de passe"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            {mode === "login" && (
              <button
                type="button"
                className="mt-2 text-xs font-medium text-brand-400 hover:text-brand-300"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" loading={loading} disabled={loading}>
            {mode === "login" ? "Se connecter" : "S'inscrire"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-white/55">
          {mode === "login" ? (
            <>
              Pas encore de compte ?{" "}
              <Link href="/register" className="font-medium text-brand-400 hover:text-brand-300">
                S&apos;inscrire
              </Link>
            </>
          ) : (
            <>
              Déjà un compte ?{" "}
              <Link href="/login" className="font-medium text-brand-400 hover:text-brand-300">
                Se connecter
              </Link>
            </>
          )}
        </p>
        {mode === "login" && (
          <p className="mt-2 text-center text-sm">
            <Link href="/mot-de-passe-oublie" className="text-brand-400 hover:underline">
              Mot de passe oublié ?
            </Link>
          </p>
        )}
      </CardBody>
    </Card>
  );
}
