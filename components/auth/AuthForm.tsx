"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

interface AuthFormProps {
  mode: "login" | "register";
  /** Redirection après succès (ex. /checkout) — panier localStorage conservé */
  redirectTo?: string;
  /** Affichage intégré (page checkout) */
  embedded?: boolean;
}

export function AuthForm({ mode, redirectTo, embedded }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect =
    redirectTo || searchParams.get("redirect") || searchParams.get("next") || "/account";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    firstName: "",
    lastName: "",
    phone: "",
    adultConfirmed: false,
    acceptTerms: false,
    acceptPrivacy: false,
    newsletter: false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "register") {
        if (form.password !== form.passwordConfirm) {
          setError("Les mots de passe ne correspondent pas");
          return;
        }
        if (!form.adultConfirmed) {
          setError("Vous devez certifier avoir 18 ans ou plus");
          return;
        }
        if (!form.acceptTerms || !form.acceptPrivacy) {
          setError("Veuillez accepter les conditions et la politique de confidentialité");
          return;
        }
      }

      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? { email: form.email, password: form.password }
          : {
              email: form.email,
              password: form.password,
              passwordConfirm: form.passwordConfirm,
              firstName: form.firstName,
              lastName: form.lastName,
              phone: form.phone,
              adultConfirmed: form.adultConfirmed,
              acceptTerms: form.acceptTerms,
              acceptPrivacy: form.acceptPrivacy,
              newsletter: form.newsletter,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Une erreur est survenue");
        return;
      }

      const dest =
        ["EMPLOYE", "ADMIN", "PROPRIETAIRE"].includes(data.user?.role) &&
        !redirect.startsWith("/checkout")
          ? "/admin"
          : redirect || "/account";
      router.push(dest);
      router.refresh();
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  }

  const registerHref = `/register?redirect=${encodeURIComponent(redirect)}`;
  const loginHref = `/login?redirect=${encodeURIComponent(redirect)}`;

  const content = (
    <>
      <h1 className="text-2xl font-bold text-white">
        {mode === "login" ? "Se connecter" : "Créer un compte"}
      </h1>
      <p className="mt-1 text-sm text-[#A7B0BC]">
        {mode === "login"
          ? "Connectez-vous à votre compte pour poursuivre votre commande."
          : "Créez votre compte All Vap's pour commander en ligne."}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "register" && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Prénom"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
              <Input
                label="Nom"
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </div>
            <Input
              label="Téléphone"
              type="tel"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </>
        )}
        <Input
          label="Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          label="Mot de passe"
          type="password"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {mode === "register" && (
          <>
            <Input
              label="Confirmer le mot de passe"
              type="password"
              required
              minLength={8}
              value={form.passwordConfirm}
              onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })}
            />
            <label className="flex items-start gap-2 text-sm text-[#A7B0BC]">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.adultConfirmed}
                onChange={(e) => setForm({ ...form, adultConfirmed: e.target.checked })}
                required
              />
              <span>Je certifie avoir 18 ans ou plus.</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[#A7B0BC]">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.acceptTerms}
                onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })}
                required
              />
              <span>
                J&apos;accepte les{" "}
                <Link href="/cgv" className="text-brand-400 hover:underline">
                  conditions générales
                </Link>
                .
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[#A7B0BC]">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.acceptPrivacy}
                onChange={(e) => setForm({ ...form, acceptPrivacy: e.target.checked })}
                required
              />
              <span>
                J&apos;accepte la{" "}
                <Link href="/politique-confidentialite" className="text-brand-400 hover:underline">
                  politique de confidentialité
                </Link>
                .
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[#A7B0BC]">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.newsletter}
                onChange={(e) => setForm({ ...form, newsletter: e.target.checked })}
              />
              <span>Je souhaite recevoir la newsletter (facultatif).</span>
            </label>
          </>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" loading={loading}>
          {mode === "login" ? "Se connecter" : "Créer un compte"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-[#A7B0BC]">
        {mode === "login" ? (
          <>
            Pas encore de compte ?{" "}
            <Link href={registerHref} className="font-medium text-brand-400 hover:text-brand-300">
              Créer un compte
            </Link>
          </>
        ) : (
          <>
            Déjà un compte ?{" "}
            <Link href={loginHref} className="font-medium text-brand-400 hover:text-brand-300">
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
    </>
  );

  if (embedded) {
    return <div className="mx-auto w-full max-w-md">{content}</div>;
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardBody>{content}</CardBody>
    </Card>
  );
}
