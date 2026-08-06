/**
 * Token d’accès client (secours si le cookie httpOnly n’est pas appliqué / lu).
 * Persistance triple : localStorage + sessionStorage + IndexedDB (PWA Android).
 */

const BEARER_KEY = "allvaps_bearer";
const IDB_NAME = "allvaps-auth";
const IDB_STORE = "tokens";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function idbAvailable(): boolean {
  return canUseStorage() && typeof indexedDB !== "undefined";
}

function openAuthDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb_open_failed"));
  });
}

async function idbSetToken(token: string | null): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openAuthDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      if (token) store.put(token, BEARER_KEY);
      else store.delete(BEARER_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("idb_write_failed"));
    });
    db.close();
  } catch {
    /* mode privé / quota */
  }
}

async function idbGetToken(): Promise<string | null> {
  if (!idbAvailable()) return null;
  try {
    const db = await openAuthDb();
    const value = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(BEARER_KEY);
      req.onsuccess = () =>
        resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => reject(req.error || new Error("idb_read_failed"));
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

export function storeAccessToken(token: string | null | undefined) {
  if (!canUseStorage()) return;
  try {
    if (token) {
      localStorage.setItem(BEARER_KEY, token);
      sessionStorage.setItem(BEARER_KEY, token);
    } else {
      localStorage.removeItem(BEARER_KEY);
      sessionStorage.removeItem(BEARER_KEY);
    }
  } catch {
    /* mode privé / quota */
  }
  void idbSetToken(token || null);
}

export function getAccessToken(): string | null {
  if (!canUseStorage()) return null;
  try {
    return localStorage.getItem(BEARER_KEY) || sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

/** Restaure le Bearer depuis IndexedDB si local/session Storage vide (PWA Android). */
export async function restoreAccessToken(): Promise<string | null> {
  const existing = getAccessToken();
  if (existing) return existing;
  const fromIdb = await idbGetToken();
  if (fromIdb) {
    try {
      localStorage.setItem(BEARER_KEY, fromIdb);
      sessionStorage.setItem(BEARER_KEY, fromIdb);
    } catch {
      /* ignore */
    }
  }
  return fromIdb;
}

export function clearAccessToken() {
  storeAccessToken(null);
}

/** Headers Authorization Bearer si un token client est présent. */
export function withAuthHeaders(init?: HeadersInit, explicitToken?: string | null): HeadersInit {
  const token = explicitToken || getAccessToken();
  if (!token) return init || {};
  const headers = new Headers(init || {});
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

/** fetch same-origin avec cookie + Bearer de secours. */
export function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit & { accessToken?: string | null }
): Promise<Response> {
  const { accessToken, ...rest } = init || {};
  const headers = withAuthHeaders(rest.headers, accessToken);
  return fetch(input, {
    ...rest,
    credentials: rest.credentials ?? "include",
    cache: rest.cache ?? "no-store",
    headers,
  });
}

export type SessionUser = {
  id?: string;
  email?: string;
  role?: string;
  mustChangePassword?: boolean;
};

/**
 * Confirme que /api/auth/me voit l’utilisateur.
 * @param explicitToken JWT renvoyé par POST /api/auth/login — à passer immédiatement
 *   pour ne pas dépendre du timing cookie / storage.
 */
export async function confirmSession(explicitToken?: string | null): Promise<{
  ok: boolean;
  user: SessionUser | null;
  status: number;
  serverError: boolean;
  code?: string;
}> {
  if (explicitToken && explicitToken.length > 20) {
    storeAccessToken(explicitToken);
  }
  await restoreAccessToken();
  const token =
    (explicitToken && explicitToken.length > 20 ? explicitToken : null) ||
    getAccessToken();

  const attempt = async () => {
    const res = await authFetch("/api/auth/me", {
      cache: "no-store",
      credentials: "include",
      accessToken: token,
    });
    const data = (await res.json().catch(() => ({}))) as {
      user?: SessionUser | null;
      authenticated?: boolean;
      code?: string;
      error?: string;
    };
    const user = (data?.user ?? null) as SessionUser | null;
    const ok = Boolean(user && (res.ok || res.status === 200));
    return {
      ok,
      user: user && typeof user === "object" ? user : null,
      status: res.status,
      serverError: res.status >= 500,
      code: typeof data.code === "string" ? data.code : undefined,
    };
  };

  let result = await attempt();
  // Retry unique sur erreur serveur (déploiement / Prisma froid)
  if (result.serverError) {
    await new Promise((r) => setTimeout(r, 400));
    result = await attempt();
  }
  return result;
}
