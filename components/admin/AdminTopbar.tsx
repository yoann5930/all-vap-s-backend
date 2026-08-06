"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Mail,
  AlertTriangle,
} from "lucide-react";

type Props = {
  email: string;
  firstName?: string | null;
  alertCount?: number;
  onMenuOpen: () => void;
};

export function AdminTopbar({ email, firstName, alertCount = 0, onMenuOpen }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("admin-global-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    router.push(`/admin/recherche?q=${encodeURIComponent(term)}`);
  }

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/admin/login";
    } finally {
      setBusy(false);
    }
  }

  async function syncStocks() {
    setBusy(true);
    try {
      await fetch("/api/admin/stocks/sync", { method: "POST" });
      router.refresh();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="admin-topbar sticky top-0 z-30 flex items-center gap-3 px-4 lg:px-6">
      <button
        type="button"
        className="rounded-lg p-2 text-[#8b95a5] hover:bg-white/5 lg:hidden"
        onClick={onMenuOpen}
        aria-label="Ouvrir le menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <form onSubmit={submitSearch} className="relative min-w-0 flex-1 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b95a5]" />
        <input
          id="admin-global-search"
          className="admin-input pl-10"
          placeholder="Rechercher commande, client, produit, suivi… (Ctrl+K)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Recherche globale"
        />
      </form>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <Link
          href="/admin/orders?filter=to_prepare"
          className="admin-btn admin-btn-ghost hidden sm:inline-flex"
          title="Commandes à préparer"
        >
          Préparer
        </Link>
        <button
          type="button"
          className="admin-btn admin-btn-ghost hidden md:inline-flex"
          onClick={syncStocks}
          disabled={busy}
          title="Synchroniser les stocks"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        </button>
        <Link href="/admin/emails" className="admin-btn admin-btn-ghost" title="Boîte mail">
          <Mail className="h-4 w-4" />
        </Link>
        <Link href="/admin/alertes" className="admin-btn admin-btn-ghost relative" title="Alertes">
          {alertCount > 0 ? (
            <AlertTriangle className="h-4 w-4 text-[#f0a020]" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {alertCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4455] px-1 text-[10px] text-white">
              {alertCount > 9 ? "9+" : alertCount}
            </span>
          )}
        </Link>
        <div className="hidden text-right sm:block">
          <p className="text-xs text-[#f2f4f7]">{firstName || "Admin"}</p>
          <p className="max-w-[140px] truncate text-[10px] text-[#8b95a5]">{email}</p>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn-ghost"
          onClick={logout}
          disabled={busy}
          title="Déconnexion"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
