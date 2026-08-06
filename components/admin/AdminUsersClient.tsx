"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import "@/app/admin/admin-theme.css";

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

type SortKey =
  | "name"
  | "email"
  | "role"
  | "stores"
  | "status"
  | "lastLogin"
  | "sessions";

type SortDir = "asc" | "desc";

const STORE_OPTIONS = ["HAUTMONT", "LE_QUESNOY"] as const;

function formatApiError(data: {
  error?: string;
  details?: { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] };
}): string {
  if (data.error && data.error !== "Validation failed") return data.error;
  const field = data.details?.fieldErrors;
  if (field) {
    const parts = Object.entries(field)
      .filter(([, msgs]) => Array.isArray(msgs) && msgs.length > 0)
      .map(([k, msgs]) => `${k}: ${(msgs as string[]).join(", ")}`);
    if (parts.length) return parts.join(" · ");
  }
  const form = data.details?.formErrors?.filter(Boolean);
  if (form?.length) return form.join(" · ");
  return data.error || "Erreur";
}

function displayName(u: UserRow) {
  const n = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return n || "—";
}

function roleLabel(role: string) {
  if (role === "EMPLOYEE") return "EMPLOYÉ";
  if (role === "ADMIN") return "ADMIN";
  if (role === "CUSTOMER") return "CLIENT";
  return role;
}

function storeLabel(code: string) {
  if (code === "LE_QUESNOY") return "LE QUESNOY";
  if (code === "HAUTMONT") return "HAUTMONT";
  return code.replaceAll("_", " ");
}

function formatLastLogin(iso: string | null) {
  if (!iso) return "Jamais";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "gold";
}) {
  return (
    <span className={`admin-users-badge admin-users-badge--${tone}`} title={String(children)}>
      {children}
    </span>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={className}>
      <button type="button" className="admin-users-sort" onClick={onClick}>
        <span>{label}</span>
        <span className="admin-users-sort-ind" aria-hidden>
          {active ? (dir === "asc" ? "▲" : "▼") : "◇"}
        </span>
      </button>
    </th>
  );
}

export function AdminUsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tempPwd, setTempPwd] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "EMPLOYEE",
    allowedStores: ["HAUTMONT", "LE_QUESNOY"] as string[],
  });

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [storeFilter, setStoreFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    firstName: "",
    lastName: "",
    role: "EMPLOYEE",
  });
  const [storesEditorId, setStoresEditorId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (!res.ok) {
      setError(formatApiError(data));
      return;
    }
    setUsers(data.users || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createUser() {
    setLoading(true);
    setError("");
    setMessage("");
    setTempPwd(null);

    const payload = {
      email: form.email.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      role: form.role,
      allowedStores: form.allowedStores,
    };

    if (!payload.email || !payload.firstName || !payload.lastName) {
      setError("Email, prénom et nom sont obligatoires.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data));
      setTempPwd(data.temporaryPassword || null);
      setMessage(`Utilisateur ${payload.email} créé`);
      setForm({
        email: "",
        firstName: "",
        lastName: "",
        role: "EMPLOYEE",
        allowedStores: ["HAUTMONT", "LE_QUESNOY"],
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function patch(userId: string, body: Record<string, unknown>) {
    setLoading(true);
    setError("");
    setTempPwd(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatApiError(data));
      if (data.temporaryPassword) setTempPwd(data.temporaryPassword);
      setMessage("Mise à jour enregistrée");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  function openEdit(u: UserRow) {
    setEditingId(u.id);
    setEditDraft({
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      role: u.role,
    });
    setStoresEditorId(null);
  }

  async function saveEdit(userId: string) {
    await patch(userId, {
      firstName: editDraft.firstName.trim(),
      lastName: editDraft.lastName.trim(),
      role: editDraft.role,
    });
    setEditingId(null);
  }

  async function saveStores(userId: string, stores: string[]) {
    await patch(userId, { allowedStores: stores });
    setStoresEditorId(null);
  }

  async function softDelete(u: UserRow) {
    if (!u.active) {
      setMessage("Ce compte est déjà désactivé.");
      return;
    }
    const ok = window.confirm(
      `Désactiver le compte ${u.email} ?\n(Aucune suppression physique — accès bloqué.)`
    );
    if (!ok) return;
    await patch(u.id, { active: false });
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = users.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (statusFilter === "ACTIVE" && !u.active) return false;
      if (statusFilter === "INACTIVE" && u.active) return false;
      if (storeFilter !== "ALL") {
        const stores = u.allowedStores || [];
        if (!stores.includes(storeFilter)) return false;
      }
      if (!needle) return true;
      const hay = [
        displayName(u),
        u.email,
        roleLabel(u.role),
        ...(u.allowedStores || []).map(storeLabel),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });

    const mul = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      const sessionsA = a._count?.inventorySessions ?? 0;
      const sessionsB = b._count?.inventorySessions ?? 0;
      switch (sortKey) {
        case "email":
          return mul * a.email.localeCompare(b.email, "fr");
        case "role":
          return mul * a.role.localeCompare(b.role, "fr");
        case "stores":
          return (
            mul *
            (a.allowedStores || [])
              .join(",")
              .localeCompare((b.allowedStores || []).join(","), "fr")
          );
        case "status": {
          const sa = (a.active ? 1 : 0) + (a.mustChangePassword ? 0.5 : 0);
          const sb = (b.active ? 1 : 0) + (b.mustChangePassword ? 0.5 : 0);
          return mul * (sa - sb);
        }
        case "lastLogin": {
          const ta = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
          const tb = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
          return mul * (ta - tb);
        }
        case "sessions":
          return mul * (sessionsA - sessionsB);
        case "name":
        default:
          return mul * displayName(a).localeCompare(displayName(b), "fr");
      }
    });
    return list;
  }, [users, q, roleFilter, storeFilter, statusFilter, sortKey, sortDir]);

  function renderStatus(u: UserRow) {
    return (
      <div className="admin-users-badges admin-users-badges--status">
        <Badge tone={u.active ? "success" : "danger"}>{u.active ? "ACTIF" : "INACTIF"}</Badge>
        {u.mustChangePassword ? <Badge tone="warning">MDP À CHANGER</Badge> : null}
      </div>
    );
  }

  function renderStores(u: UserRow) {
    const stores = u.allowedStores || [];
    if (!stores.length) return <span className="admin-users-muted">—</span>;
    return (
      <div className="admin-users-badges">
        {stores.map((s) => (
          <Badge key={s} tone="gold">
            {storeLabel(s)}
          </Badge>
        ))}
      </div>
    );
  }

  function renderActions(u: UserRow) {
    return (
      <div className="admin-users-actions">
        <button
          type="button"
          className="admin-users-btn"
          disabled={loading}
          onClick={() => openEdit(u)}
        >
          Modifier
        </button>
        <button
          type="button"
          className="admin-users-btn"
          disabled={loading}
          onClick={() => void patch(u.id, { resetPassword: true })}
        >
          Réinitialiser MDP
        </button>
        <button
          type="button"
          className="admin-users-btn"
          disabled={loading}
          onClick={() => {
            setStoresEditorId((id) => (id === u.id ? null : u.id));
            setEditingId(null);
          }}
        >
          Boutiques
        </button>
        <button
          type="button"
          className="admin-users-btn"
          disabled={loading}
          onClick={() => void patch(u.id, { active: !u.active })}
        >
          {u.active ? "Désactiver" : "Réactiver"}
        </button>
        <button
          type="button"
          className="admin-users-btn admin-users-btn--danger"
          disabled={loading || !u.active}
          onClick={() => void softDelete(u)}
          title="Désactive le compte (pas de suppression physique)"
        >
          Supprimer
        </button>
      </div>
    );
  }

  function renderInlinePanels(u: UserRow) {
    return (
      <>
        {editingId === u.id && (
          <div className="admin-users-panel">
            <div className="admin-users-panel-grid">
              <label className="admin-users-field">
                <span>Prénom</span>
                <input
                  className="admin-input"
                  value={editDraft.firstName}
                  onChange={(e) => setEditDraft({ ...editDraft, firstName: e.target.value })}
                />
              </label>
              <label className="admin-users-field">
                <span>Nom</span>
                <input
                  className="admin-input"
                  value={editDraft.lastName}
                  onChange={(e) => setEditDraft({ ...editDraft, lastName: e.target.value })}
                />
              </label>
              <label className="admin-users-field">
                <span>Rôle</span>
                <select
                  className="admin-input"
                  value={editDraft.role}
                  onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value })}
                >
                  <option value="EMPLOYEE">EMPLOYEE</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="CUSTOMER">CUSTOMER</option>
                </select>
              </label>
            </div>
            <div className="admin-users-panel-actions">
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                disabled={loading}
                onClick={() => void saveEdit(u.id)}
              >
                Enregistrer
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={() => setEditingId(null)}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
        {storesEditorId === u.id && (
          <div className="admin-users-panel">
            <p className="admin-users-panel-title">Boutiques autorisées</p>
            <div className="admin-users-badges">
              {STORE_OPTIONS.map((code) => {
                const selected = (u.allowedStores || []).includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    className={`admin-users-badge admin-users-badge--toggle ${
                      selected ? "admin-users-badge--gold" : "admin-users-badge--neutral"
                    }`}
                    onClick={() => {
                      const current = new Set(u.allowedStores || []);
                      if (current.has(code)) current.delete(code);
                      else current.add(code);
                      void saveStores(u.id, Array.from(current));
                    }}
                  >
                    {storeLabel(code)}
                  </button>
                );
              })}
            </div>
            <div className="admin-users-panel-actions">
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={() =>
                  void saveStores(u.id, ["HAUTMONT", "LE_QUESNOY"])
                }
              >
                Les 2 boutiques
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={() => setStoresEditorId(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="admin-app admin-users space-y-6 rounded-[var(--adm-radius)] p-1 sm:p-2">
      <div>
        <h1 className="admin-users-title">Utilisateurs</h1>
        <p className="admin-users-sub">
          Gestion des comptes inventaire — Yoann uniquement (ADMIN).
        </p>
      </div>

      {error && <p className="admin-users-alert admin-users-alert--error">{error}</p>}
      {message && <p className="admin-users-alert admin-users-alert--ok">{message}</p>}
      {tempPwd && (
        <div className="admin-users-alert admin-users-alert--warn">
          Mot de passe temporaire (à transmettre hors Git / logs) :{" "}
          <code className="font-mono font-semibold">{tempPwd}</code>
        </div>
      )}

      <div className="admin-card p-4 sm:p-5">
        <h2 className="admin-users-section-title">Créer un utilisateur</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input
            className="admin-input"
            placeholder="Email *"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <select
            className="admin-input"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="EMPLOYEE">EMPLOYEE</option>
            <option value="ADMIN">ADMIN</option>
            <option value="CUSTOMER">CUSTOMER</option>
          </select>
          <input
            className="admin-input"
            placeholder="Prénom *"
            required
            autoComplete="given-name"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
          <input
            className="admin-input"
            placeholder="Nom *"
            required
            autoComplete="family-name"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--adm-muted)" }}>
          Champs obligatoires : email, prénom, nom. Rôle par défaut : EMPLOYEE (2 boutiques).
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void createUser()}
          className="admin-btn admin-btn-primary mt-3 disabled:opacity-50"
        >
          Créer
        </button>
      </div>

      <div className="admin-card p-4 sm:p-5">
        <div className="admin-users-toolbar">
          <label className="admin-users-search">
            <input
              className="admin-input"
              placeholder="Rechercher nom, email, boutique…"
              aria-label="Rechercher"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <select
            className="admin-input admin-users-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Filtrer par rôle"
          >
            <option value="ALL">Tous les rôles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="EMPLOYEE">EMPLOYÉ</option>
            <option value="CUSTOMER">CLIENT</option>
          </select>
          <select
            className="admin-input admin-users-filter"
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            aria-label="Filtrer par boutique"
          >
            <option value="ALL">Toutes les boutiques</option>
            <option value="HAUTMONT">HAUTMONT</option>
            <option value="LE_QUESNOY">LE QUESNOY</option>
          </select>
          <select
            className="admin-input admin-users-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filtrer par statut"
          >
            <option value="ALL">Actif / Inactif</option>
            <option value="ACTIVE">Actif</option>
            <option value="INACTIVE">Inactif</option>
          </select>
          <p className="admin-users-count">
            {filtered.length} / {users.length}
          </p>
        </div>

        {/* Desktop / tablette : tableau */}
        <div className="admin-users-table-wrap admin-users-desktop">
          <table className="admin-users-table">
            <thead>
              <tr>
                <SortHeader
                  label="Nom"
                  active={sortKey === "name"}
                  dir={sortDir}
                  onClick={() => toggleSort("name")}
                />
                <SortHeader
                  label="Email"
                  active={sortKey === "email"}
                  dir={sortDir}
                  onClick={() => toggleSort("email")}
                />
                <SortHeader
                  label="Rôle"
                  active={sortKey === "role"}
                  dir={sortDir}
                  onClick={() => toggleSort("role")}
                />
                <SortHeader
                  label="Boutique(s)"
                  active={sortKey === "stores"}
                  dir={sortDir}
                  onClick={() => toggleSort("stores")}
                  className="admin-users-col-hide-md"
                />
                <SortHeader
                  label="Statut"
                  active={sortKey === "status"}
                  dir={sortDir}
                  onClick={() => toggleSort("status")}
                />
                <SortHeader
                  label="Dernière connexion"
                  active={sortKey === "lastLogin"}
                  dir={sortDir}
                  onClick={() => toggleSort("lastLogin")}
                  className="admin-users-col-hide-lg"
                />
                <SortHeader
                  label="Sessions inventaire"
                  active={sortKey === "sessions"}
                  dir={sortDir}
                  onClick={() => toggleSort("sessions")}
                  className="admin-users-col-hide-lg"
                />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-users-empty">
                    Aucun utilisateur ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <Fragment key={u.id}>
                    <tr>
                      <td>
                        <div className="admin-users-name">{displayName(u)}</div>
                      </td>
                      <td>
                        <div className="admin-users-email" title={u.email}>
                          {u.email}
                        </div>
                      </td>
                      <td>
                        <Badge tone={u.role === "ADMIN" ? "info" : "neutral"}>
                          {roleLabel(u.role)}
                        </Badge>
                      </td>
                      <td className="admin-users-col-hide-md">{renderStores(u)}</td>
                      <td>{renderStatus(u)}</td>
                      <td className="admin-users-col-hide-lg admin-users-nowrap">
                        {formatLastLogin(u.lastLoginAt)}
                      </td>
                      <td className="admin-users-col-hide-lg admin-users-sessions">
                        {u._count?.inventorySessions ?? 0}
                      </td>
                    </tr>
                    <tr className="admin-users-actions-row">
                      <td colSpan={7}>
                        <div className="admin-users-actions-bar">
                          <span className="admin-users-actions-label">Actions</span>
                          {renderActions(u)}
                        </div>
                        {renderInlinePanels(u)}
                      </td>
                    </tr>
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile : cartes */}
        <div className="admin-users-mobile">
          {filtered.length === 0 ? (
            <p className="admin-users-empty">Aucun utilisateur ne correspond aux filtres.</p>
          ) : (
            filtered.map((u) => (
              <article key={u.id} className="admin-users-card">
                <header className="admin-users-card-head">
                  <div>
                    <h3 className="admin-users-name">{displayName(u)}</h3>
                    <p className="admin-users-email">{u.email}</p>
                  </div>
                  <Badge tone={u.role === "ADMIN" ? "info" : "neutral"}>
                    {roleLabel(u.role)}
                  </Badge>
                </header>
                <div className="admin-users-card-row">
                  <span className="admin-users-muted">Boutique(s)</span>
                  {renderStores(u)}
                </div>
                <div className="admin-users-card-row">
                  <span className="admin-users-muted">Statut</span>
                  {renderStatus(u)}
                </div>
                <div className="admin-users-card-meta">
                  <span>Dernière connexion : {formatLastLogin(u.lastLoginAt)}</span>
                  <span>Sessions : {u._count?.inventorySessions ?? 0}</span>
                </div>
                {renderInlinePanels(u)}
                {renderActions(u)}
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
