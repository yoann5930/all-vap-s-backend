import {
  COMMAND_CLASS,
  AVA_DEVICE_COMMANDS,
  URL_ALLOWLIST,
  type AvaDeviceCommand,
  type AvaDeviceCommandClass,
} from "@/lib/ava-device/types";
import { isFullControlEnabled, isShellDiagnosticEnabled } from "@/lib/ava-device/auth";

const AUTH_STOP_HINTS =
  /(mot de passe|password|code pin|biometric|empreinte|sms|otp|2fa)/i;

export function parseCommand(raw: string): AvaDeviceCommand | null {
  const cmd = (raw || "").trim().toUpperCase() as AvaDeviceCommand;
  return (AVA_DEVICE_COMMANDS as readonly string[]).includes(cmd) ? cmd : null;
}

export function commandClass(cmd: AvaDeviceCommand): AvaDeviceCommandClass {
  return COMMAND_CLASS[cmd];
}

export function isUrlAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const origin = u.origin.toLowerCase();
    return URL_ALLOWLIST.some((allowed) => new URL(allowed).origin.toLowerCase() === origin);
  } catch {
    return false;
  }
}

export function looksLikeAuthChallenge(text: string): boolean {
  return AUTH_STOP_HINTS.test(text || "");
}

export type PolicyDecision =
  | { ok: true; dryRun: boolean }
  | {
      ok: false;
      errorCode:
        | "AVA_DEVICE_UNKNOWN_COMMAND"
        | "AVA_DEVICE_CRITICAL_APPROVAL_REQUIRED"
        | "AVA_DEVICE_SENSITIVE_BLOCKED"
        | "AVA_DEVICE_FULL_CONTROL_DISABLED"
        | "AVA_DEVICE_SHELL_DISABLED"
        | "AVA_DEVICE_AUTH_STOP";
      message: string;
    };

/**
 * CRITICAL : approval obligatoire même avec FULL_CONTROL.
 * SENSITIVE : bloqué sauf FULL_CONTROL (et jamais d'envoi réel sans dry-run).
 * SHELL : désactivé par défaut.
 * Fidelatoo write : dry-run par défaut.
 */
export function evaluateCommandPolicy(params: {
  command: AvaDeviceCommand;
  args: Record<string, unknown>;
  approvalOk: boolean;
  typeText?: string;
}): PolicyDecision {
  const cls = commandClass(params.command);
  const dryRunRequested = params.args.dryRun !== false;
  const fidelatooWrite = params.command === "FIDELATOO_ADD_POINTS";
  const dryRun = fidelatooWrite ? true : dryRunRequested && cls !== "SAFE_READ";

  if (params.command === "SHELL_DIAGNOSTIC") {
    if (!isShellDiagnosticEnabled()) {
      return {
        ok: false,
        errorCode: "AVA_DEVICE_SHELL_DISABLED",
        message: "Shell diagnostic désactivé",
      };
    }
    if (!params.approvalOk) {
      return {
        ok: false,
        errorCode: "AVA_DEVICE_CRITICAL_APPROVAL_REQUIRED",
        message: "Approbation critique requise",
      };
    }
  }

  if (cls === "CRITICAL" && !params.approvalOk) {
    return {
      ok: false,
      errorCode: "AVA_DEVICE_CRITICAL_APPROVAL_REQUIRED",
      message: "Approbation critique requise",
    };
  }

  if (cls === "SENSITIVE" && !isFullControlEnabled()) {
    return {
      ok: false,
      errorCode: "AVA_DEVICE_FULL_CONTROL_DISABLED",
      message: "FULL_CONTROL désactivé — action sensible refusée",
    };
  }

  if (params.command === "TYPE_TEXT" && looksLikeAuthChallenge(String(params.typeText || params.args.text || ""))) {
    return {
      ok: false,
      errorCode: "AVA_DEVICE_AUTH_STOP",
      message: "Saisie d'identifiants refusée — intervention propriétaire requise",
    };
  }

  if (params.command === "OPEN_URL") {
    const url = String(params.args.url || "");
    if (!isUrlAllowed(url)) {
      return {
        ok: false,
        errorCode: "AVA_DEVICE_AUTH_STOP",
        message: "URL hors allowlist HTTPS",
      };
    }
  }

  if (fidelatooWrite) {
    return { ok: true, dryRun: true };
  }

  void dryRun;
  return { ok: true, dryRun: fidelatooWrite ? true : Boolean(params.args.dryRun) };
}

export const FIDELATOO_DRY_RUN = "FIDELATOO_DRY_RUN";
export const DEVICE_FULL_CONTROL = "DEVICE_FULL_CONTROL";
