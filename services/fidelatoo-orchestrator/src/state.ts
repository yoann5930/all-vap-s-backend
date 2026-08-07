export type VmStatus = "online" | "stopped" | "starting" | "error";
export type AppStatus = "installed" | "open" | "closed" | "update_required" | "unknown";
export type AvaAccountStatus =
  | "not_configured"
  | "registration_in_progress"
  | "qr_ready"
  | "awaiting_scan"
  | "collaborator_active"
  | "session_expired"
  | "suspended"
  | "blocked";

export type StoreCode = "HAUTMONT" | "LE_QUESNOY";

export type RuntimeState = {
  vm: VmStatus;
  app: AppStatus;
  ava: AvaAccountStatus;
  role: "collaboratrice" | "none" | "unknown";
  stores: StoreCode[];
  lastError: string | null;
  qrBase64: string | null;
  qrMime: string | null;
  qrExpiresAt: number | null;
  updatedAt: string;
};

const state: RuntimeState = {
  vm: "stopped",
  app: "unknown",
  ava: "not_configured",
  role: "none",
  stores: [],
  lastError: null,
  qrBase64: null,
  qrMime: null,
  qrExpiresAt: null,
  updatedAt: new Date().toISOString(),
};

export function getState(): RuntimeState {
  if (state.qrExpiresAt && Date.now() >= state.qrExpiresAt) {
    state.qrBase64 = null;
    state.qrMime = null;
    state.qrExpiresAt = null;
    if (state.ava === "qr_ready" || state.ava === "awaiting_scan") {
      state.ava = "registration_in_progress";
    }
  }
  return state;
}

export function touch(): void {
  state.updatedAt = new Date().toISOString();
}

export function setQr(base64: string, mime: string, ttlSec: number): string {
  const expiresAt = Date.now() + ttlSec * 1000;
  state.qrBase64 = base64;
  state.qrMime = mime;
  state.qrExpiresAt = expiresAt;
  touch();
  return new Date(expiresAt).toISOString();
}

export function clearQr(): void {
  state.qrBase64 = null;
  state.qrMime = null;
  state.qrExpiresAt = null;
  touch();
}

export function snapshot(avaEmail: string) {
  const s = getState();
  return {
    vm: s.vm,
    app: s.app,
    ava: s.ava,
    avaEmail,
    role: s.role,
    stores: [...s.stores],
    qrAvailable: !!(s.qrBase64 && s.qrExpiresAt && Date.now() < s.qrExpiresAt),
    qrExpiresAt: s.qrExpiresAt ? new Date(s.qrExpiresAt).toISOString() : null,
    orchestratorConfigured: true,
    orchestratorReachable: true,
    lastError: s.lastError,
    updatedAt: s.updatedAt,
  };
}
