"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Inscription newsletter : enregistrement réel via API contact / newsletter.
 * Pas de faux succès — si l'API échoue, message d'erreur clair.
 */
export function NewsletterSignup({ className }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Inscription impossible pour le moment.");
        return;
      }
      setStatus("ok");
      setMessage(data.message || "Merci — votre demande a bien été enregistrée.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Inscription impossible pour le moment.");
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Votre e-mail"
          aria-label="Adresse e-mail newsletter"
          required
          className="premium-input flex-1 rounded-xl px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="premium-btn premium-btn-primary shrink-0 px-5 py-2.5 text-sm"
        >
          {status === "loading" ? "Envoi…" : "S'inscrire"}
        </button>
      </form>
      {message && (
        <p className={cn("text-xs", status === "error" ? "text-red-400" : "text-emerald-400")}>
          {message}
        </p>
      )}
    </div>
  );
}
