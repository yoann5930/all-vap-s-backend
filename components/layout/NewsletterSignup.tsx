"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function NewsletterSignup({ className }: { className?: string }) {
  const [email, setEmail] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    window.location.href = `/contact?email=${encodeURIComponent(email.trim())}`;
  }

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-2 sm:flex-row", className)}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Votre e-mail"
        aria-label="Adresse e-mail newsletter"
        className="premium-input flex-1 rounded-xl px-4 py-2.5 text-sm"
      />
      <button type="submit" className="premium-btn premium-btn-primary shrink-0 px-5 py-2.5 text-sm">
        S&apos;inscrire
      </button>
    </form>
  );
}
