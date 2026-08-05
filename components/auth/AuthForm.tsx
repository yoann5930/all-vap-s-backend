"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? {
              email: form.email.trim().toLowerCase(),
              password: form.password.trim(),
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
        credentials: "same-origin",
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

      const params = new URLSearchParams(window.location.search);
      const rawNext = params.get("next");
      const next =
        rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

      if (data.user?.mustChangePassword) {
        window.location.assign(
          `/changer-mot-de-passe?next=${encodeURIComponent(next || "/inventaire")}`
        );
        return;
      }
      if (data.user?.role === "ADMIN") {
        window.location.assign(next || "/admin/inventaires");
        return;
      }
      if (data.user?.role === "EMPLOYEE") {
        window.location.assign(next || "/inventaire");
        return;
      }
      window.location.assign(next || "/account");
    } catch {
      setError("Erreur de connexion au serveur — vérifiez votre réseau / URL");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardBody>
        <h1 className="text-2xl font-bold text-white">
          {mode === "login" ? "Connexion" : "Créer un compte"}
        </h1>
        <p className="mt-1 text-sm text-white/60">
          {mode === "login"
            ? "Employés inventaire et administration All Vap's"
            : "Rejoignez la communauté All Vap's"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" autoComplete="on">
          {mode === "register" && (
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Prénom"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                autoComplete="given-name"
              />
              <Input
                label="Nom"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                autoComplete="family-name"
              />
            </div>
          )}
          <Input
            label="Email"
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

          <Button type="submit" className="w-full" loading={loading}>
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
