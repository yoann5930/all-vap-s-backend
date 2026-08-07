import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  getFidelatooOrchestratorConfig,
  AVA_FIDELATOO_EMAIL,
} from "./config";
import type {
  FidelatooCommand,
  FidelatooStatusSnapshot,
  FidelatooStoreCode,
  OrchestratorCommandResult,
} from "./types";
import { FIDELATOO_COMMANDS } from "./types";
import { applyMockCommand, getMockSnapshot } from "./mock-state";
import { clearEphemeralQr, getEphemeralQr, qrAvailability, setEphemeralQr } from "./qr-store";

/** Anti-rejeu : jetons d'action à usage unique (mémoire process). */
const usedNonces = new Map<string, number>();

function pruneNonces() {
  const now = Date.now();
  for (const [k, exp] of usedNonces) {
    if (now >= exp) usedNonces.delete(k);
  }
}

function newActionId(): string {
  return randomBytes(16).toString("hex");
}

function signPayload(secret: string, body: string, timestamp: string, nonce: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${body}`)
    .digest("hex");
}

function isAllowedCommand(command: string): command is FidelatooCommand {
  return (FIDELATOO_COMMANDS as readonly string[]).includes(command);
}

function offlineSnapshot(message: string): FidelatooStatusSnapshot {
  const cfg = getFidelatooOrchestratorConfig();
  const qr = qrAvailability();
  return {
    vm: "stopped",
    app: "unknown",
    ava: "not_configured",
    avaEmail: cfg.avaEmail || AVA_FIDELATOO_EMAIL,
    role: "none",
    stores: [],
    qrAvailable: qr.available,
    qrExpiresAt: qr.expiresAt,
    orchestratorConfigured: cfg.configured,
    orchestratorReachable: false,
    lastError: message,
    updatedAt: new Date().toISOString(),
  };
}

export async function getFidelatooStatus(): Promise<FidelatooStatusSnapshot> {
  const cfg = getFidelatooOrchestratorConfig();

  if (cfg.mockEnabled && !cfg.configured) {
    return { ...getMockSnapshot(cfg.avaEmail), orchestratorConfigured: false };
  }

  if (!cfg.configured) {
    return offlineSnapshot(
      "Orchestrateur non configuré (FIDELATOO_ORCHESTRATOR_URL + SECRET + ENABLED)"
    );
  }

  const result = await sendOrchestratorCommand("status");
  if (!result.ok || !result.status) {
    return offlineSnapshot(result.message || "Orchestrateur injoignable");
  }

  const qr = qrAvailability();
  return {
    vm: result.status.vm || "error",
    app: result.status.app || "unknown",
    ava: result.status.ava || "not_configured",
    avaEmail: cfg.avaEmail,
    role: result.status.role || "unknown",
    stores: result.status.stores || [],
    qrAvailable: qr.available || !!result.status.qrAvailable,
    qrExpiresAt: qr.expiresAt || result.status.qrExpiresAt || null,
    orchestratorConfigured: true,
    orchestratorReachable: true,
    lastError: result.status.lastError || null,
    updatedAt: new Date().toISOString(),
  };
}

export async function runFidelatooCommand(
  command: FidelatooCommand,
  extras?: { store?: FidelatooStoreCode; allow?: boolean }
): Promise<OrchestratorCommandResult> {
  if (!isAllowedCommand(command)) {
    throw new Error("FORBIDDEN");
  }

  const cfg = getFidelatooOrchestratorConfig();
  const actionId = newActionId();

  if (cfg.mockEnabled && !cfg.configured) {
    const mock = applyMockCommand(command, {
      store: extras?.store,
      allow: extras?.allow,
      actionId,
      qrTtlSec: cfg.qrTtlSec,
    });
    if (mock.qrImageBase64 && command !== "ava.qr_image") {
      // QR déjà stocké dans mock pour continue_to_qr
    }
    return {
      ok: mock.ok,
      actionId,
      command,
      message: mock.message,
      status: getMockSnapshot(cfg.avaEmail),
      qrImageBase64: mock.qrImageBase64,
      qrMime: mock.qrMime,
      qrExpiresAt: mock.qrExpiresAt,
    };
  }

  if (!cfg.configured) {
    return {
      ok: false,
      actionId,
      command,
      message: "Orchestrateur non configuré",
      status: offlineSnapshot("Orchestrateur non configuré"),
    };
  }

  const result = await sendOrchestratorCommand(command, extras, actionId);

  // Capturer le QR en mémoire éphémère — ne jamais logger le payload
  if (result.ok && result.qrImageBase64 && (command === "ava.continue_to_qr" || command === "ava.qr_image")) {
    const exp = setEphemeralQr({
      imageBase64: result.qrImageBase64,
      mime: result.qrMime || "image/png",
      ttlSec: cfg.qrTtlSec,
      actionId,
    });
    result.qrExpiresAt = exp.expiresAt;
  }

  if (result.ok && command === "ava.qr_scanned") {
    clearEphemeralQr();
  }

  return result;
}

export function readQrForAdmin(): {
  imageBase64: string;
  mime: string;
  expiresAt: string;
} | null {
  const q = getEphemeralQr();
  if (!q) return null;
  return { imageBase64: q.imageBase64, mime: q.mime, expiresAt: q.expiresAt };
}

async function sendOrchestratorCommand(
  command: FidelatooCommand,
  extras?: { store?: FidelatooStoreCode; allow?: boolean },
  actionId = newActionId()
): Promise<OrchestratorCommandResult> {
  const cfg = getFidelatooOrchestratorConfig();
  const secret = (process.env.FIDELATOO_ORCHESTRATOR_SECRET || "").trim();
  if (!cfg.baseUrl || !secret) {
    return {
      ok: false,
      actionId,
      command,
      message: "Secret ou URL manquant",
    };
  }

  pruneNonces();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(12).toString("hex");
  const expiresAt = Date.now() + cfg.commandTtlSec * 1000;

  usedNonces.set(nonce, expiresAt);

  const payload = {
    actionId,
    command,
    avaEmail: cfg.avaEmail,
    store: extras?.store,
    allow: extras?.allow,
    issuedAt: timestamp,
    expiresAt: Math.floor(expiresAt / 1000),
    nonce,
  };
  const body = JSON.stringify(payload);
  const signature = signPayload(secret, body, timestamp, nonce);

  try {
    const res = await fetch(`${cfg.baseUrl}/v1/command`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Allvaps-Timestamp": timestamp,
        "X-Allvaps-Nonce": nonce,
        "X-Allvaps-Signature": signature,
        "X-Allvaps-Action-Id": actionId,
      },
      body,
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      status?: Partial<FidelatooStatusSnapshot>;
      qrImageBase64?: string | null;
      qrMime?: string | null;
      qrExpiresAt?: string | null;
      agent?: Record<string, unknown>;
      journal?: unknown[];
      identity?: Record<string, unknown>;
    };

    if (!res.ok) {
      return {
        ok: false,
        actionId,
        command,
        message: data.message || `Orchestrateur HTTP ${res.status}`,
      };
    }

    return {
      ok: data.ok !== false,
      actionId,
      command,
      message: data.message,
      status: data.status,
      qrImageBase64: data.qrImageBase64,
      qrMime: data.qrMime,
      qrExpiresAt: data.qrExpiresAt,
      agent: data.agent,
      journal: data.journal,
      identity: data.identity,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Orchestrateur injoignable";
    const readable =
      /fetch failed|ECONNREFUSED|ETIMEDOUT|AbortError|timeout|UND_ERR/i.test(raw)
        ? `Orchestrateur injoignable (${cfg.baseUrl}). Vérifiez Caddy/HTTPS fidelatoo.allvaps.fr et le service local :8787. Détail: ${raw}`
        : raw;
    return {
      ok: false,
      actionId,
      command,
      message: readable,
    };
  }
}

/** Vérifie une réponse signée optionnelle (callback futur). */
export function verifyOrchestratorCallback(
  body: string,
  timestamp: string,
  nonce: string,
  signature: string
): boolean {
  const secret = (process.env.FIDELATOO_ORCHESTRATOR_SECRET || "").trim();
  if (!secret || !timestamp || !nonce || !signature) return false;
  const expected = signPayload(secret, body, timestamp, nonce);
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
