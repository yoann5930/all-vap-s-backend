"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

export default function ForgotPasswordPage() {
  const [mode, setMode] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (t) {
      setToken(t);
      setMode("reset");
    }
  }, []);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    setMessage(data.message || "Email envoyé si le compte existe.");
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || "Erreur");
    else setMessage("Mot de passe mis à jour. Vous pouvez vous connecter.");
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      {mode === "request" ? (
        <Card>
          <CardBody>
            <h1 className="text-2xl font-bold">Mot de passe oublié</h1>
            <form onSubmit={handleRequest} className="mt-6 space-y-4">
              <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              {message && <p className="text-sm text-brand-700">{message}</p>}
              <Button type="submit" className="w-full">Envoyer le lien</Button>
            </form>
            <p className="mt-4 text-center text-sm">
              <Link href="/login" className="text-brand-700">Retour connexion</Link>
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
            <form onSubmit={handleReset} className="mt-6 space-y-4">
              <Input label="Nouveau mot de passe" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              {error && <p className="text-sm text-red-600">{error}</p>}
              {message && <p className="text-sm text-brand-700">{message}</p>}
              <Button type="submit" className="w-full">Réinitialiser</Button>
            </form>
            <p className="mt-4 text-center text-sm">
              <Link href="/login" className="text-brand-700">Se connecter</Link>
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
