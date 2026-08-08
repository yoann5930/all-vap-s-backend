"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { clearAccessToken, confirmSession, storeAccessToken } from "@/lib/auth-client";

interface AuthFormProps {
  mode: "login" | "register";
  /** Redirection post-login (ex. checkout embarqué) */
  redirectTo?: string;
  /** Affichage sans titre marketing (ex. checkout) */
  embedded?: boolean;
}

/** Aligné sur le schéma Zod de POST /api/auth/register — ne pas desserrer le backend. */
type RegisterFormState = {
  email: string;
  password: string;
  passwordConfirm: string;
  firstName: string;
  lastName: string;
  phone: string;
  adultConfirmed: boolean;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  newsletter: boolean;
};

const emptyRegister: RegisterFormState = {
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
};

export function AuthForm({ mode, redirectTo, embedded = false }: AuthFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const submittingRef = useRef(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState<RegisterFormState>(emptyRegister);

  function validateRegisterClient(): boolean {
    const errs: Record<string, string> = {};
    const f = registerForm;
    if (!f.firstName.trim()) errs.firstName = "Veuillez renseigner votre prénom.";
    if (!f.lastName.trim()) errs.lastName = "Veuillez renseigner votre nom.";
    if (!f.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
      errs.email = "Veuillez renseigner une adresse email valide.";
    }
    if (!f.phone.trim() || f.phone.trim().length < 6) {
      errs.phone = "Veuillez renseigner votre numéro de téléphone.";
    }
    if (f.password.length < 8) {
      errs.password = "Le mot de passe doit contenir au moins 8 caractères.";
    } else if (!/[A-Za-z]/.test(f.password)) {
      errs.password = "Le mot de passe doit contenir une lettre.";
    } else if (!/[0-9]/.test(f.password)) {
      errs.password = "Le mot de passe doit contenir un chiffre.";
    }
    if (!f.passwordConfirm.trim()) {
      errs.passwordConfirm = "Veuillez confirmer votre mot de passe.";
    } else if (f.password !== f.passwordConfirm) {
      errs.passwordConfirm = "Les mots de passe ne correspondent pas.";
    }
    if (!f.adultConfirmed) {
      errs.adultConfirmed = "Vous devez confirmer être majeur(e) pour créer un compte.";
    }
    if (!f.acceptTerms) {
      errs.acceptTerms = "Vous devez accepter les Conditions Générales d’Utilisation.";
    }
    if (!f.acceptPrivacy) {
      errs.acceptPrivacy = "Vous devez accepter la politique de confidentialité.";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  /** Traduit les erreurs API (Zod / codes) en messages français compréhensibles. */
  function mapRegisterApiErrors(data: {
    error?: unknown;
    code?: unknown;
    details?: { fieldErrors?: Record<string, string[] | undefined> };
  }): { banner: string; fields: Record<string, string> } {
    const fields: Record<string, string> = {};
    const fieldMap: Record<string, string> = {
      firstName: "Veuillez renseigner votre prénom.",
      lastName: "Veuillez renseigner votre nom.",
      email: "Veuillez renseigner une adresse email valide.",
      phone: "Veuillez renseigner votre numéro de téléphone.",
      password: "Le mot de passe est invalide.",
      passwordConfirm: "Veuillez confirmer votre mot de passe.",
      adultConfirmed: "Vous devez confirmer être majeur(e) pour créer un compte.",
      acceptTerms: "Vous devez accepter les Conditions Générales d’Utilisation.",
      acceptPrivacy: "Vous devez accepter la politique de confidentialité.",
    };

    const rawFields = data.details?.fieldErrors;
    if (rawFields && typeof rawFields === "object") {
      for (const [key, msgs] of Object.entries(rawFields)) {
        if (!Array.isArray(msgs) || msgs.length === 0) continue;
        const joined = msgs.join(" ");
        if (key === "passwordConfirm" && /ne correspondent pas/i.test(joined)) {
          fields[key] = "Les mots de passe ne correspondent pas.";
        } else if (fieldMap[key]) {
          fields[key] = fieldMap[key];
        } else {
          fields[key] = "Ce champ est invalide.";
        }
      }
    }

    const rawError = typeof data.error === "string" ? data.error : "";
    if (
      data.code === "VALIDATION_FAILED" ||
      /Required|Invalid literal|expected true|Zod/i.test(rawError)
    ) {
      return {
        banner:
          Object.keys(fields).length > 0
            ? "Veuillez corriger les champs indiqués."
            : "Veuillez vérifier les informations du formulaire.",
        fields,
      };
    }

    if (/déjà utilisé|already|EMAIL_EXISTS|existe déjà/i.test(rawError)) {
      return {
        banner: "Un compte existe déjà avec cette adresse email.",
        fields: { email: "Un compte existe déjà avec cette adresse email." },
      };
    }

    return {
      banner:
        rawError && !/Required|Invalid literal|expected true|ZodError|stack/i.test(rawError)
          ? rawError
          : "Une erreur est survenue lors de la création du compte. Veuillez réessayer.",
      fields,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    setLoading(true);
    setError("");
    setFieldErrors({});

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";

      if (mode === "register" && !validateRegisterClient()) {
        setError("Veuillez corriger les champs indiqués.");
        return;
      }

      const payload =
        mode === "login"
          ? {
              email: loginForm.email.trim().toLowerCase(),
              password: loginForm.password.trim(),
              next:
                typeof window !== "undefined"
                  ? new URLSearchParams(window.location.search).get("next") ||
                    new URLSearchParams(window.location.search).get("redirect") ||
                    undefined
                  : undefined,
            }
          : {
              email: registerForm.email.trim().toLowerCase(),
              password: registerForm.password,
              passwordConfirm: registerForm.passwordConfirm,
              firstName: registerForm.firstName.trim(),
              lastName: registerForm.lastName.trim(),
              phone: registerForm.phone.trim(),
              adultConfirmed: true as const,
              acceptTerms: true as const,
              acceptPrivacy: true as const,
              newsletter: registerForm.newsletter,
            };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (mode === "register") {
          const mapped = mapRegisterApiErrors(data);
          setFieldErrors(mapped.fields);
          setError(mapped.banner);
        } else {
          setError(
            typeof data.error === "string" && data.error
              ? data.error
              : "Email ou mot de passe incorrect"
          );
        }
        return;
      }

      const loginToken =
        typeof data.token === "string" && data.token.length > 20 ? data.token : null;

      if (loginToken) {
        storeAccessToken(loginToken);
      } else {
        clearAccessToken();
      }

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
        const rawNext =
          redirectTo ||
          params.get("next") ||
          params.get("redirect");
        const next =
          rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

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
        const serverRedirect =
          typeof data.redirectTo === "string" && data.redirectTo.startsWith("/")
            ? data.redirectTo
            : typeof session.user.redirectTo === "string" &&
                session.user.redirectTo.startsWith("/")
              ? session.user.redirectTo
              : null;

        window.location.assign(next ? computed : serverRedirect || computed);
        return;
      }

      // Inscription : session immédiate si token renvoyé
      if (loginToken) {
        const session = await confirmSession(loginToken);
        if (!session.ok || !session.user) {
          setError(
            "Compte créé mais session non confirmée. Connectez-vous depuis la page Connexion."
          );
          return;
        }
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
        {mode === "register" && !embedded && (
          <p className="mt-1 text-sm text-white/60">
            Rejoignez la communauté All Vap&apos;s — réservé aux majeurs (+18 ans)
          </p>
        )}
        {mode === "login" && embedded && (
          <p className="mt-1 text-sm text-white/60">Connectez-vous pour finaliser votre commande</p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" autoComplete="on" noValidate>
          {mode === "register" && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Prénom"
                  name="firstName"
                  required
                  value={registerForm.firstName}
                  error={fieldErrors.firstName}
                  onChange={(e) =>
                    setRegisterForm({ ...registerForm, firstName: e.target.value })
                  }
                  autoComplete="given-name"
                />
                <Input
                  label="Nom"
                  name="lastName"
                  required
                  value={registerForm.lastName}
                  error={fieldErrors.lastName}
                  onChange={(e) =>
                    setRegisterForm({ ...registerForm, lastName: e.target.value })
                  }
                  autoComplete="family-name"
                />
              </div>
              <Input
                label="Téléphone"
                name="phone"
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                value={registerForm.phone}
                error={fieldErrors.phone}
                onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
              />
            </>
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
            value={mode === "login" ? loginForm.email : registerForm.email}
            error={fieldErrors.email}
            onChange={(e) =>
              mode === "login"
                ? setLoginForm({ ...loginForm, email: e.target.value })
                : setRegisterForm({ ...registerForm, email: e.target.value })
            }
          />

          <div>
            <Input
              label="Mot de passe"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={mode === "login" ? loginForm.password : registerForm.password}
              error={fieldErrors.password}
              onChange={(e) =>
                mode === "login"
                  ? setLoginForm({ ...loginForm, password: e.target.value })
                  : setRegisterForm({ ...registerForm, password: e.target.value })
              }
            />
            <button
              type="button"
              className="mt-2 text-xs font-medium text-brand-400 hover:text-brand-300"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            </button>
          </div>

          {mode === "register" && (
            <>
              <Input
                label="Confirmer le mot de passe"
                name="passwordConfirm"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={registerForm.passwordConfirm}
                error={fieldErrors.passwordConfirm}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, passwordConfirm: e.target.value })
                }
              />

              <fieldset className="space-y-1 rounded-xl border border-white/10 px-3 py-2">
                <legend className="px-1 text-xs text-white/50">Confirmations obligatoires</legend>

                <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    name="adultConfirmed"
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-white/30"
                    checked={registerForm.adultConfirmed}
                    onChange={(e) =>
                      setRegisterForm({
                        ...registerForm,
                        adultConfirmed: e.target.checked,
                      })
                    }
                  />
                  <span>
                    Je certifie être majeur(e).
                    {fieldErrors.adultConfirmed && (
                      <span className="mt-1 block text-red-400">{fieldErrors.adultConfirmed}</span>
                    )}
                  </span>
                </label>

                <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    name="acceptTerms"
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-white/30"
                    checked={registerForm.acceptTerms}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, acceptTerms: e.target.checked })
                    }
                  />
                  <span>
                    J&apos;accepte les{" "}
                    <Link href="/cgv" className="text-brand-400 hover:underline" target="_blank">
                      Conditions Générales d&apos;Utilisation
                    </Link>
                    .
                    {fieldErrors.acceptTerms && (
                      <span className="mt-1 block text-red-400">{fieldErrors.acceptTerms}</span>
                    )}
                  </span>
                </label>

                <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    name="acceptPrivacy"
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-white/30"
                    checked={registerForm.acceptPrivacy}
                    onChange={(e) =>
                      setRegisterForm({
                        ...registerForm,
                        acceptPrivacy: e.target.checked,
                      })
                    }
                  />
                  <span>
                    J&apos;accepte la{" "}
                    <Link
                      href="/politique-confidentialite"
                      className="text-brand-400 hover:underline"
                      target="_blank"
                    >
                      Politique de confidentialité
                    </Link>
                    .
                    {fieldErrors.acceptPrivacy && (
                      <span className="mt-1 block text-red-400">{fieldErrors.acceptPrivacy}</span>
                    )}
                  </span>
                </label>

                <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2 text-sm text-white/55">
                  <input
                    type="checkbox"
                    name="newsletter"
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-white/30"
                    checked={registerForm.newsletter}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, newsletter: e.target.checked })
                    }
                  />
                  <span>Je souhaite recevoir la newsletter (optionnel)</span>
                </label>
              </fieldset>
            </>
          )}

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
