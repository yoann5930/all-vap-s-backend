import { timingSafeEqual, createHmac, createHash, randomBytes } from "node:crypto";
import { AVA_DEVICE_ID_DEFAULT } from "@/lib/ava-device/types";

export function envFlag(name: string): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

export function isAvaDeviceGatewayEnabled(): boolean {
  return envFlag("AVA_DEVICE_GATEWAY_ENABLED");
}

export function isFullControlEnabled(): boolean {
  return envFlag("AVA_DEVICE_FULL_CONTROL_ENABLED");
}

export function isShellDiagnosticEnabled(): boolean {
  return envFlag("AVA_DEVICE_SHELL_ENABLED");
}

function operatorToken(): string {
  return (process.env.AVA_DEVICE_GATEWAY_TOKEN || "").trim();
}

function enrollToken(): string {
  return (process.env.AVA_DEVICE_ENROLL_TOKEN || "").trim();
}

function approvalToken(): string {
  return (process.env.AVA_DEVICE_APPROVAL_TOKEN || "").trim();
}

export function operatorTokenConfigured(): boolean {
  return operatorToken().length >= 16;
}

export function safeEqualString(got: string, expected: string): boolean {
  const left = Buffer.from(got, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function extractBearerToken(authorization: string | null | undefined): string | null {
  const raw = (authorization || "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  const token = raw.slice(7).trim();
  return token || null;
}

export function allowedDeviceIds(): string[] {
  const raw = (process.env.AVA_DEVICE_ALLOWED_IDS || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAllowedDeviceId(deviceId: string): boolean {
  const allowed = allowedDeviceIds();
  if (!allowed.length) return false;
  return allowed.includes(deviceId);
}

export function isValidDeviceId(deviceId: string): boolean {
  return /^AVA-[A-Z0-9-]{3,40}$/.test((deviceId || "").trim());
}

export type OperatorAuthResult =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 404 | 503;
      errorCode: "AVA_DEVICE_DISABLED" | "AVA_DEVICE_UNAUTHORIZED";
      message: string;
    };

export function authorizeOperator(authorization: string | null | undefined): OperatorAuthResult {
  if (!isAvaDeviceGatewayEnabled()) {
    return { ok: false, status: 404, errorCode: "AVA_DEVICE_DISABLED", message: "Not found" };
  }
  if (!operatorTokenConfigured()) {
    return {
      ok: false,
      status: 503,
      errorCode: "AVA_DEVICE_UNAUTHORIZED",
      message: "Passerelle appareil indisponible",
    };
  }
  const got = extractBearerToken(authorization);
  if (!got || !safeEqualString(got, operatorToken())) {
    return { ok: false, status: 401, errorCode: "AVA_DEVICE_UNAUTHORIZED", message: "Non autorisé" };
  }
  return { ok: true };
}

export function authorizeEnroll(authorization: string | null | undefined): OperatorAuthResult {
  if (!isAvaDeviceGatewayEnabled()) {
    return { ok: false, status: 404, errorCode: "AVA_DEVICE_DISABLED", message: "Not found" };
  }
  const expected = enrollToken();
  if (expected.length < 16) {
    return {
      ok: false,
      status: 503,
      errorCode: "AVA_DEVICE_UNAUTHORIZED",
      message: "Enrôlement indisponible",
    };
  }
  const got = extractBearerToken(authorization);
  if (!got || !safeEqualString(got, expected)) {
    return { ok: false, status: 401, errorCode: "AVA_DEVICE_UNAUTHORIZED", message: "Non autorisé" };
  }
  return { ok: true };
}

export function authorizeApprovalIssuer(authorization: string | null | undefined): OperatorAuthResult {
  if (!isAvaDeviceGatewayEnabled()) {
    return { ok: false, status: 404, errorCode: "AVA_DEVICE_DISABLED", message: "Not found" };
  }
  const expected = approvalToken();
  if (expected.length < 16) {
    return {
      ok: false,
      status: 503,
      errorCode: "AVA_DEVICE_UNAUTHORIZED",
      message: "Approbation critique indisponible",
    };
  }
  const got = extractBearerToken(authorization);
  if (!got || !safeEqualString(got, expected)) {
    return { ok: false, status: 401, errorCode: "AVA_DEVICE_UNAUTHORIZED", message: "Non autorisé" };
  }
  return { ok: true };
}

export function hmacSignature(secret: string, canonical: string): string {
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

export function canonicalDeviceRequest(params: {
  timestamp: string;
  method: string;
  path: string;
  bodyRaw: string;
}): string {
  const bodyHash = createHash("sha256").update(params.bodyRaw || "").digest("hex");
  return `${params.timestamp}.${params.method.toUpperCase()}.${params.path}.${bodyHash}`;
}

export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function defaultDeviceId(): string {
  return AVA_DEVICE_ID_DEFAULT;
}
