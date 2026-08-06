/** Statuts VM Android (orchestration privée — jamais ADB exposé). */
export type VmStatus = "online" | "stopped" | "starting" | "error";

/** Statuts app Fidelatoo sur la VM. */
export type AppStatus = "installed" | "open" | "closed" | "update_required" | "unknown";

/** Cycle de vie du compte collaboratrice A.V.A. */
export type AvaAccountStatus =
  | "not_configured"
  | "registration_in_progress"
  | "qr_ready"
  | "awaiting_scan"
  | "collaborator_active"
  | "session_expired"
  | "suspended"
  | "blocked";

export type FidelatooStoreCode = "HAUTMONT" | "LE_QUESNOY";

/** Commandes autorisées uniquement (whitelist — anti-commande arbitraire). */
export const FIDELATOO_COMMANDS = [
  "vm.start",
  "vm.stop",
  "vm.restart",
  "vm.remote_open",
  "app.open",
  "ava.start_registration",
  "ava.continue_to_qr",
  "ava.qr_status",
  "ava.qr_image",
  "ava.qr_scanned",
  "ava.verify_role",
  "ava.test_login",
  "ava.suspend",
  "ava.revoke",
  "ava.recover",
  "ava.authorize_store",
  "ava.revoke_store",
  "status",
] as const;

export type FidelatooCommand = (typeof FIDELATOO_COMMANDS)[number];

export type FidelatooStatusSnapshot = {
  vm: VmStatus;
  app: AppStatus;
  ava: AvaAccountStatus;
  avaEmail: string;
  role: "collaboratrice" | "none" | "unknown";
  stores: FidelatooStoreCode[];
  qrAvailable: boolean;
  qrExpiresAt: string | null;
  orchestratorConfigured: boolean;
  orchestratorReachable: boolean;
  lastError: string | null;
  updatedAt: string;
};

export type OrchestratorCommandResult = {
  ok: boolean;
  actionId: string;
  command: FidelatooCommand;
  message?: string;
  status?: Partial<FidelatooStatusSnapshot>;
  /** Présent uniquement pour qr_image — jamais loggé. */
  qrImageBase64?: string | null;
  qrMime?: string | null;
  qrExpiresAt?: string | null;
};
