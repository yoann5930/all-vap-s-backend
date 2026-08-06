/** Token d’accès client (fallback si le cookie httpOnly n’est pas renvoyé / lu). */
const BEARER_KEY = "allvaps_bearer";

export function storeAccessToken(token: string | null | undefined) {
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem(BEARER_KEY, token);
  else sessionStorage.removeItem(BEARER_KEY);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(BEARER_KEY);
}

export function clearAccessToken() {
  storeAccessToken(null);
}

/** Headers Authorization Bearer si un token sessionStorage est présent. */
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
