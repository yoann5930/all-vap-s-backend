"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  UserX,
  X,
} from "lucide-react";

/** Racine inventaire (rewrite / → /inventaire côté middleware). */
const INVENTAIRE_HOME_URL = "https://inventaire.allvaps.fr";
/** Route de connexion employé détectée dans l’app. */
const INVENTAIRE_LOGIN_URL = "https://inventaire.allvaps.fr/login?next=/inventaire";
const PAGE_SIZE = 10;

type UserRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  allowedStores: string[];
  lastLoginAt: string | null;
  createdAt: string;
  _count?: { inventorySessions?: number; orders?: number };
};

type StatusFilter = "all" | "active" | "suspended";

type SecureCodeModalState = {
  title: string;
  employeeName: string;
  email: string;
  code: string;
};

function displayName(u: Pick<UserRow, "firstName" | "lastName" | "email">) {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email;
}

function formatLoginDate(iso: string | null) {
  if (!iso) return "Jamais";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function SecureCodeModal({
  state,
  onClose,
}: {
  state: SecureCodeModalState;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy(key: string, value: string) {
    await copyText(value);
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="secure-code-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="secure-code-title" className="text-lg font-semibold text-gray-900">
              {state.title}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {state.employeeName} · {state.email}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Fermer"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
            Code temporaire — affichage unique
          </p>
          <p className="mt-2 break-all font-mono text-lg font-semibold text-amber-950">
            {state.code}
          </p>
          <p className="mt-2 text-xs text-amber-800">
            Transmettez-le hors Git et hors logs. Après fermeture, il ne pourra plus être
            réaffiché (seul le hash bcrypt est conservé).
          </p>
        </div>

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white"
            onClick={() => void copy("code", state.code)}
          >
            {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copier le code
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
            onClick={() => void copy("url", INVENTAIRE_HOME_URL)}
          >
            {copied === "url" ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            Copier l’adresse de connexion
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
            onClick={() => void copy("email", state.email)}
          >
            {copied === "email" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copier l’adresse e-mail
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>

        <p className="mt-3 text-[11px] text-gray-400">
          Connexion : {INVENTAIRE_HOME_URL} (login : {INVENTAIRE_LOGIN_URL})
        </p>
      </div>
    </div>
  );
}

export function AdminUsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    accessCode: "",
    active: true,
  });

  /** Fenêtre sécurisée one-shot — effacée à la fermeture. */
  const [secureModal, setSecureModal] = useState<SecureCodeModalState | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", email: "" });

  const closeSecureModal = useCallback(() => {
    setSecureModal(null);
  }, []);

  const load = useCallback(async () => {
    setListLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur de chargement");
      setUsers(data.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setListLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const sorted = useMemo(() => {
    return [...users].sort((a, b) =>
      displayName(a).localeCompare(displayName(b), "fr", { sensitivity: "base" })
    );
  }, [users]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  function flashCopy(key: string) {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1600);
  }

  async function createUser() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      if (!form.firstName.trim() || !form.lastName.trim()) {
        throw new Error("Le nom de l’employé est obligatoire.");
      }
      if (!form.email.trim()) {
        throw new Error("L’adresse e-mail est obligatoire.");
      }
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          role: "EMPLOYEE",
          active: form.active,
          allowedStores: ["HAUTMONT", "LE_QUESNOY"],
          ...(form.accessCode.trim() ? { accessCode: form.accessCode.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Création impossible");
      const email = form.email.trim();
      const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
      setForm({ firstName: "", lastName: "", email: "", accessCode: "", active: true });
      setShowAdd(false);
      setMessage("Employé créé. Notez le code temporaire avant de fermer la fenêtre.");
      if (typeof data.temporaryPassword === "string" && data.temporaryPassword) {
        setSecureModal({
          title: "Code d’accès créé",
          employeeName: name,
          email,
          code: data.temporaryPassword,
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function patch(userId: string, body: Record<string, unknown>, okMsg?: string) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mise à jour impossible");
      setEditId(null);
      if (data.temporaryPassword && typeof data.temporaryPassword === "string") {
        const u = users.find((x) => x.id === userId);
        setSecureModal({
          title: "Code réinitialisé",
          employeeName: u ? displayName(u) : "Employé",
          email: u?.email || data.user?.email || "",
          code: data.temporaryPassword,
        });
        setMessage("Code réinitialisé — affiché une seule fois. L’ancien code est invalidé.");
      } else {
        setMessage(okMsg || "Mise à jour enregistrée");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function resetAccessCode(u: UserRow) {
    const ok = window.confirm(
      `Réinitialiser le code de ${displayName(u)} ?\n\nL’ancien code sera immédiatement invalidé. Le nouveau s’affichera une seule fois.`
    );
    if (!ok) return;
    await patch(u.id, { resetPassword: true });
  }

  function startEdit(u: UserRow) {
    setEditId(u.id);
    setEditForm({
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      email: u.email,
    });
  }

  async function saveEdit(userId: string) {
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    if (!editForm.email.trim()) {
      setError("L’adresse e-mail est obligatoire.");
      return;
    }
    await patch(
      userId,
      {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim(),
      },
      "Identité mise à jour"
    );
  }

  function ActionsCell({ u }: { u: UserRow }) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {editId === u.id ? (
          <>
            <button
              type="button"
              disabled={loading}
              className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              onClick={() => void saveEdit(u.id)}
            >
              Enregistrer
            </button>
            <button
              type="button"
              className="rounded-lg border px-2.5 py-1.5 text-xs"
              onClick={() => setEditId(null)}
            >
              Annuler
            </button>
          </>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => startEdit(u)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Modifier
          </button>
        )}
        <button
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          onClick={() => void resetAccessCode(u)}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Réinitialiser le code
        </button>
        <button
          type="button"
          disabled={loading}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
            u.active
              ? "border-amber-200 text-amber-900 hover:bg-amber-50"
              : "border-emerald-200 text-emerald-800 hover:bg-emerald-50"
          }`}
          onClick={() =>
            void patch(
              u.id,
              { active: !u.active },
              u.active ? "Accès suspendu" : "Accès réactivé"
            )
          }
        >
          {u.active ? (
            <>
              <UserX className="h-3.5 w-3.5" /> Suspendre
            </>
          ) : (
            <>
              <UserCheck className="h-3.5 w-3.5" /> Réactiver
            </>
          )}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          title={`Copier ${INVENTAIRE_HOME_URL}`}
          onClick={() => {
            void copyText(INVENTAIRE_HOME_URL).then(() => flashCopy(`url-${u.id}`));
          }}
        >
          {copiedKey === `url-${u.id}` ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          Copier l’adresse de connexion
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {secureModal ? (
        <SecureCodeModal state={secureModal} onClose={closeSecureModal} />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accès inventaire</h1>
          <p className="mt-1 text-sm text-gray-600">
            Comptes employés — connexion via{" "}
            <a
              href={INVENTAIRE_HOME_URL}
              className="font-medium text-brand-700 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              inventaire.allvaps.fr
            </a>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAdd ? "Fermer" : "Ajouter un employé"}
        </button>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {message}
        </p>
      ) : null}

      {showAdd ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Nouvel employé</h2>
          <p className="mt-1 text-xs text-gray-500">
            Un code temporaire est généré automatiquement (ou saisi ici). Seul le hash bcrypt
            est stocké ; le code clair s’affiche une seule fois après création.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Prénom *</span>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Nom *</span>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-gray-700">E-mail / identifiant *</span>
              <input
                type="email"
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-gray-700">
                Code d’accès (optionnel — généré automatiquement sinon)
              </span>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 font-mono"
                value={form.accessCode}
                onChange={(e) => setForm({ ...form, accessCode: e.target.value })}
                placeholder="Min. 8 caractères"
                autoComplete="new-password"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Accès actif dès la création
            </label>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void createUser()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Créer l’accès
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm"
            placeholder="Rechercher par nom ou e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Filtrer par statut"
        >
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="suspended">Suspendus</option>
        </select>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          onClick={() => void load()}
        >
          <RefreshCw className={`h-4 w-4 ${listLoading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Nom de l’employé</th>
                <th className="px-4 py-3">Adresse e-mail</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Dernière connexion</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    <span className="mt-2 block text-sm">Chargement des accès…</span>
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                    Aucun employé trouvé.
                  </td>
                </tr>
              ) : (
                pageRows.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3">
                      {editId === u.id ? (
                        <div className="grid max-w-xs grid-cols-2 gap-2">
                          <input
                            className="rounded-lg border px-2 py-1.5 text-sm"
                            value={editForm.firstName}
                            onChange={(e) =>
                              setEditForm({ ...editForm, firstName: e.target.value })
                            }
                            placeholder="Prénom"
                          />
                          <input
                            className="rounded-lg border px-2 py-1.5 text-sm"
                            value={editForm.lastName}
                            onChange={(e) =>
                              setEditForm({ ...editForm, lastName: e.target.value })
                            }
                            placeholder="Nom"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-gray-900">{displayName(u)}</div>
                          <div className="text-[11px] text-gray-400">
                            {u.role === "ADMIN" ? "Administrateur" : "Employé"}
                            {u.mustChangePassword ? " · code à changer" : ""}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editId === u.id ? (
                        <input
                          className="w-full min-w-[12rem] rounded-lg border px-2 py-1.5 text-sm"
                          value={editForm.email}
                          onChange={(e) =>
                            setEditForm({ ...editForm, email: e.target.value })
                          }
                        />
                      ) : (
                        <span className="text-gray-700">{u.email}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          u.active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {u.active ? "Actif" : "Suspendu"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {formatLoginDate(u.lastLoginAt)}
                    </td>
                    <td className="px-4 py-3">
                      <ActionsCell u={u} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {listLoading ? (
          <div className="rounded-2xl border bg-white px-4 py-8 text-center text-sm text-gray-500">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            <p className="mt-2">Chargement…</p>
          </div>
        ) : pageRows.length === 0 ? (
          <div className="rounded-2xl border bg-white px-4 py-8 text-center text-sm text-gray-500">
            Aucun employé trouvé.
          </div>
        ) : (
          pageRows.map((u) => (
            <article
              key={u.id}
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  {editId === u.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="rounded-lg border px-2 py-1.5 text-sm"
                          value={editForm.firstName}
                          onChange={(e) =>
                            setEditForm({ ...editForm, firstName: e.target.value })
                          }
                          placeholder="Prénom"
                        />
                        <input
                          className="rounded-lg border px-2 py-1.5 text-sm"
                          value={editForm.lastName}
                          onChange={(e) =>
                            setEditForm({ ...editForm, lastName: e.target.value })
                          }
                          placeholder="Nom"
                        />
                      </div>
                      <input
                        className="w-full rounded-lg border px-2 py-1.5 text-sm"
                        value={editForm.email}
                        onChange={(e) =>
                          setEditForm({ ...editForm, email: e.target.value })
                        }
                        placeholder="E-mail"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="font-medium text-gray-900">{displayName(u)}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    u.active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {u.active ? "Actif" : "Suspendu"}
                </span>
              </div>
              <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-500">
                  Dernière connexion : {formatLoginDate(u.lastLoginAt)}
                </p>
                <ActionsCell u={u} />
              </div>
            </article>
          ))
        )}
      </div>

      {sorted.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
          <span>
            {sorted.length} compte{sorted.length > 1 ? "s" : ""} — page {pageSafe}/{totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 disabled:opacity-40"
              disabled={pageSafe <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Précédent
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 disabled:opacity-40"
              disabled={pageSafe >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Suivant
            </button>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-gray-400">
        Sécurité : codes stockés en bcrypt uniquement. Affichage clair strictement one-shot
        dans la fenêtre sécurisée. Adresse : {INVENTAIRE_HOME_URL}
      </p>
    </div>
  );
}
