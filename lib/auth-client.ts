/**
 * Token d’accès client (secours si le cookie httpOnly n’est pas appliqué / lu).
 * localStorage : survit mieux que sessionStorage en PWA Android après redirect.
 * sessionStorage : lu en secours (migrations / onglets déjà ouverts).
 */
const BEARER_KEY = "allvaps_bearer";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
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
}

export function getAccessToken(): string | null {
  if (!canUseStorage()) return null;
  try {
    return localStorage.getItem(BEARER_KEY) || sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

export function clearAccessToken() {
  storeAccessToken(null);
}

/** Headers Authorization Bearer si un token client est présent. */
export function withAuthHeaders(init?: HeadersInit): HeadersInit {
  const token = getAccessToken();
  if (!token) return init || {};
  const headers = new Headers(init || {});
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

/** fetch same-origin avec cookie + Bearer de secours. */
export function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = withAuthHeaders(init?.headers);
  return fetch(input, {
    ...init,
    credentials: init?.credentials ?? "same-origin",
    headers,
  });
}

/** Confirme que /api/auth/me voit bien l’utilisateur (cookie et/ou Bearer). */
export async function confirmSession(): Promise<{
  ok: boolean;
  user: { id?: string; email?: string; role?: string; mustChangePassword?: boolean } | null;
  status: number;
}> {
  const res = await authFetch("/api/auth/me", { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  const user = data?.user ?? null;
  return { ok: res.ok && !!user, user, status: res.status };
}
