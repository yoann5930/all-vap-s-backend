/**
 * Catalogue de commandes Samsung AVA — pas de shell arbitraire.
 */

export const AVA_DEVICE_ID_DEFAULT = "AVA-SAMSUNG-01";
export const AVA_MOBILE_TEST_USER = "AVA_MOBILE_TEST_USER";

export const COMMAND_CLASSES = ["SAFE_READ", "SAFE_TEST", "SENSITIVE", "CRITICAL"] as const;
export type AvaDeviceCommandClass = (typeof COMMAND_CLASSES)[number];

export const AVA_DEVICE_COMMANDS = [
  "DEVICE_STATUS",
  "DEVICE_INFO",
  "BATTERY_STATUS",
  "STORAGE_STATUS",
  "NETWORK_STATUS",
  "LIST_APPS",
  "GET_FOREGROUND_APP",
  "GET_AVA_LOGS",
  "GET_APP_LOGS",
  "CHECK_MICROPHONE",
  "CHECK_SPEAKER",
  "CHECK_CAMERA_PERMISSION",
  "CHECK_NOTIFICATION_PERMISSION",
  "CHECK_TTS",
  "CHECK_AVATAR",
  "SCREENSHOT",
  "OPEN_APP",
  "CLOSE_APP",
  "OPEN_AVA",
  "OPEN_FIDELATOO",
  "OPEN_CHROME",
  "OPEN_URL",
  "BACK",
  "HOME",
  "TAP",
  "SWIPE",
  "TYPE_TEXT",
  "WAIT_FOR_UI",
  "RUN_AVA_SCENARIO",
  "FIDELATOO_SEARCH_TEST",
  "CHECK_CARRIER_APPS",
  "SEND_EMAIL",
  "SEND_SMS",
  "PLACE_CALL",
  "FIDELATOO_ADD_POINTS",
  "FACTORY_RESET",
  "DELETE_APP",
  "DELETE_FILES",
  "INSTALL_APK",
  "BUY_SHIPPING_LABEL",
  "CREATE_SHIPMENT",
  "MODIFY_REAL_ORDER",
  "SHELL_DIAGNOSTIC",
] as const;

export type AvaDeviceCommand = (typeof AVA_DEVICE_COMMANDS)[number];

export const COMMAND_CLASS: Record<AvaDeviceCommand, AvaDeviceCommandClass> = {
  DEVICE_STATUS: "SAFE_READ",
  DEVICE_INFO: "SAFE_READ",
  BATTERY_STATUS: "SAFE_READ",
  STORAGE_STATUS: "SAFE_READ",
  NETWORK_STATUS: "SAFE_READ",
  LIST_APPS: "SAFE_READ",
  GET_FOREGROUND_APP: "SAFE_READ",
  GET_AVA_LOGS: "SAFE_READ",
  GET_APP_LOGS: "SAFE_READ",
  CHECK_MICROPHONE: "SAFE_READ",
  CHECK_SPEAKER: "SAFE_READ",
  CHECK_CAMERA_PERMISSION: "SAFE_READ",
  CHECK_NOTIFICATION_PERMISSION: "SAFE_READ",
  CHECK_TTS: "SAFE_READ",
  CHECK_AVATAR: "SAFE_READ",
  SCREENSHOT: "SAFE_TEST",
  OPEN_APP: "SAFE_TEST",
  CLOSE_APP: "SAFE_TEST",
  OPEN_AVA: "SAFE_TEST",
  OPEN_FIDELATOO: "SAFE_TEST",
  OPEN_CHROME: "SAFE_TEST",
  OPEN_URL: "SAFE_TEST",
  BACK: "SAFE_TEST",
  HOME: "SAFE_TEST",
  TAP: "SAFE_TEST",
  SWIPE: "SAFE_TEST",
  TYPE_TEXT: "SAFE_TEST",
  WAIT_FOR_UI: "SAFE_TEST",
  RUN_AVA_SCENARIO: "SAFE_TEST",
  FIDELATOO_SEARCH_TEST: "SAFE_TEST",
  CHECK_CARRIER_APPS: "SAFE_READ",
  SEND_EMAIL: "SENSITIVE",
  SEND_SMS: "SENSITIVE",
  PLACE_CALL: "SENSITIVE",
  FIDELATOO_ADD_POINTS: "CRITICAL",
  FACTORY_RESET: "CRITICAL",
  DELETE_APP: "CRITICAL",
  DELETE_FILES: "CRITICAL",
  INSTALL_APK: "CRITICAL",
  BUY_SHIPPING_LABEL: "CRITICAL",
  CREATE_SHIPMENT: "CRITICAL",
  MODIFY_REAL_ORDER: "CRITICAL",
  SHELL_DIAGNOSTIC: "CRITICAL",
};

export const KNOWN_PACKAGES = {
  avaWeb: "https://www.allvaps.fr/ava",
  allvaps: "https://www.allvaps.fr",
  chrome: "com.android.chrome",
  samsungInternet: "com.sec.android.app.sbrowser",
  fidelatoo: "fr.squirrel.fidelatoopro",
} as const;

export const URL_ALLOWLIST = [
  "https://www.allvaps.fr",
  "https://allvaps.fr",
  "https://inventaire.allvaps.fr",
];

export type AvaDeviceJobStatus = "queued" | "dispatched" | "done" | "error" | "rejected";

export type AvaDeviceJob = {
  jobId: string;
  deviceId: string;
  command: AvaDeviceCommand;
  args: Record<string, unknown>;
  class: AvaDeviceCommandClass;
  approvalId: string | null;
  dryRun: boolean;
  requester: string;
  status: AvaDeviceJobStatus;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AvaDeviceHeartbeat = {
  deviceId: string;
  online: boolean;
  lastSeen: string | null;
  battery: number | null;
  charging: boolean | null;
  network: string | null;
  freeStorageMb: number | null;
  avaAppRunning: boolean | null;
  foregroundApp: string | null;
  remoteAccessEnabled: boolean | null;
  agentVersion: string | null;
};

export type AvaDeviceOperatorRequest = {
  deviceId: string;
  command: string;
  args?: Record<string, unknown>;
  approvalId?: string;
  waitMs?: number;
  dryRun?: boolean;
  scenario?: string;
};

export type AvaDeviceOkResponse = {
  ok: true;
  deviceId: string;
  jobId: string;
  command: AvaDeviceCommand;
  status: AvaDeviceJobStatus;
  class: AvaDeviceCommandClass;
  pending: boolean;
  dryRun: boolean;
  result: Record<string, unknown> | null;
  diagnostics: {
    route: string;
    writeScope: "READ_PLUS_SIMULATE";
    latencyMs: number;
    fidelatooWrite: "NOT_EXECUTED" | "BLOCKED";
  };
};

export type AvaDeviceErrorCode =
  | "AVA_DEVICE_DISABLED"
  | "AVA_DEVICE_UNAUTHORIZED"
  | "AVA_DEVICE_UNKNOWN"
  | "AVA_DEVICE_NOT_ENROLLED"
  | "AVA_DEVICE_OFFLINE"
  | "AVA_DEVICE_INVALID_REQUEST"
  | "AVA_DEVICE_UNKNOWN_COMMAND"
  | "AVA_DEVICE_CRITICAL_APPROVAL_REQUIRED"
  | "AVA_DEVICE_SENSITIVE_BLOCKED"
  | "AVA_DEVICE_FULL_CONTROL_DISABLED"
  | "AVA_DEVICE_SHELL_DISABLED"
  | "AVA_DEVICE_RATE_LIMITED"
  | "AVA_DEVICE_AUTH_STOP";

export type AvaDeviceErrorResponse = {
  ok: false;
  errorCode: AvaDeviceErrorCode;
  message: string;
};

export type AvaDeviceResponse = AvaDeviceOkResponse | AvaDeviceErrorResponse;
