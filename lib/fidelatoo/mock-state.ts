import { createHash, randomBytes } from "crypto";
import type { AvaAccountStatus, AppStatus, FidelatooStatusSnapshot, FidelatooStoreCode, VmStatus } from "./types";
import { AVA_FIDELATOO_EMAIL } from "./config";
import { clearEphemeralQr, qrAvailability, setEphemeralQr } from "./qr-store";

type MockState = {
  vm: VmStatus;
  app: AppStatus;
  ava: AvaAccountStatus;
  role: "collaboratrice" | "none" | "unknown";
  stores: FidelatooStoreCode[];
  lastError: string | null;
};

const g = globalThis as typeof globalThis & { __fidelatooMock?: MockState };

function state(): MockState {
  if (!g.__fidelatooMock) {
    g.__fidelatooMock = {
      vm: "stopped",
      app: "closed",
      ava: "not_configured",
      role: "none",
      stores: [],
      lastError: null,
    };
  }
  return g.__fidelatooMock;
}

/** PNG 1×1 minimal — placeholder mock (pas un vrai QR Fidelatoo). */
function tinyPngBase64(): string {
  // PNG 1x1 black
  return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}

export function getMockSnapshot(avaEmail = AVA_FIDELATOO_EMAIL): FidelatooStatusSnapshot {
  const s = state();
  const qr = qrAvailability();
  return {
    vm: s.vm,
    app: s.app,
    ava: s.ava,
    avaEmail,
    role: s.role,
    stores: [...s.stores],
    qrAvailable: qr.available,
    qrExpiresAt: qr.expiresAt,
    orchestratorConfigured: false,
    orchestratorReachable: true,
    lastError: s.lastError,
    updatedAt: new Date().toISOString(),
  };
}

export function applyMockCommand(
  command: string,
  opts?: { store?: FidelatooStoreCode; allow?: boolean; actionId: string; qrTtlSec: number }
): {
  ok: boolean;
  message: string;
  qrImageBase64?: string | null;
  qrMime?: string | null;
  qrExpiresAt?: string | null;
} {
  const s = state();
  s.lastError = null;

  switch (command) {
    case "status":
      return { ok: true, message: "Statut mock" };
    case "vm.start":
      s.vm = "starting";
      s.vm = "online";
      return { ok: true, message: "VM démarrée (mock)" };
    case "vm.stop":
      s.vm = "stopped";
      s.app = "closed";
      return { ok: true, message: "VM arrêtée (mock)" };
    case "vm.restart":
      s.vm = "online";
      s.app = "closed";
      return { ok: true, message: "VM redémarrée (mock)" };
    case "vm.remote_open":
      if (s.vm !== "online") {
        s.lastError = "VM hors ligne";
        return { ok: false, message: "VM hors ligne" };
      }
      return { ok: true, message: "Accès distant simulé (mock — non exposé)" };
    case "app.open":
      if (s.vm !== "online") return { ok: false, message: "VM hors ligne" };
      s.app = "open";
      return { ok: true, message: "Fidelatoo ouvert (mock)" };
    case "ava.start_registration":
      if (s.app !== "open") return { ok: false, message: "Ouvrez Fidelatoo d'abord" };
      s.ava = "registration_in_progress";
      s.role = "none";
      return { ok: true, message: `Inscription préparée pour ${AVA_FIDELATOO_EMAIL} (mock)` };
    case "ava.continue_to_qr": {
      if (s.ava !== "registration_in_progress" && s.ava !== "awaiting_scan" && s.ava !== "qr_ready") {
        return { ok: false, message: "Démarrez l'inscription d'abord" };
      }
      s.ava = "qr_ready";
      const actionId = opts?.actionId || createHash("sha256").update(randomBytes(16)).digest("hex").slice(0, 24);
      const exp = setEphemeralQr({
        imageBase64: tinyPngBase64(),
        mime: "image/png",
        ttlSec: opts?.qrTtlSec || 120,
        actionId,
      });
      s.ava = "awaiting_scan";
      return {
        ok: true,
        message: "QR collaboratrice prêt (mock)",
        qrImageBase64: tinyPngBase64(),
        qrMime: "image/png",
        qrExpiresAt: exp.expiresAt,
      };
    }
    case "ava.qr_status":
      return { ok: true, message: qrAvailability().available ? "QR disponible" : "Aucun QR" };
    case "ava.qr_image": {
      const exp = setEphemeralQr({
        imageBase64: tinyPngBase64(),
        mime: "image/png",
        ttlSec: opts?.qrTtlSec || 120,
        actionId: opts?.actionId || "mock",
      });
      s.ava = "awaiting_scan";
      return {
        ok: true,
        message: "QR prêt",
        qrImageBase64: tinyPngBase64(),
        qrMime: "image/png",
        qrExpiresAt: exp.expiresAt,
      };
    }
    case "ava.qr_scanned":
      clearEphemeralQr();
      s.ava = "collaborator_active";
      s.role = "collaboratrice";
      return { ok: true, message: "Scan confirmé — QR effacé (mock)" };
    case "ava.verify_role":
      return {
        ok: s.role === "collaboratrice",
        message:
          s.role === "collaboratrice"
            ? `Rôle Collaboratrice OK · boutiques: ${s.stores.join(", ") || "aucune"}`
            : "Rôle Collaboratrice non confirmé",
      };
    case "ava.test_login":
      if (s.ava === "suspended" || s.ava === "blocked") {
        return { ok: false, message: "Compte suspendu ou bloqué" };
      }
      return { ok: true, message: "Reconnexion test OK (mock)" };
    case "ava.suspend":
      s.ava = "suspended";
      return { ok: true, message: "A.V.A. suspendue (mock)" };
    case "ava.revoke":
      s.ava = "blocked";
      s.role = "none";
      s.stores = [];
      clearEphemeralQr();
      return { ok: true, message: "Accès A.V.A. révoqué (mock)" };
    case "ava.recover":
      s.ava = "not_configured";
      s.role = "none";
      clearEphemeralQr();
      return { ok: true, message: "Récupération sécurisée lancée (mock)" };
    case "ava.authorize_store": {
      const store = opts?.store;
      if (!store) return { ok: false, message: "Boutique manquante" };
      if (opts?.allow !== false) {
        if (!s.stores.includes(store)) s.stores.push(store);
      } else {
        s.stores = s.stores.filter((x) => x !== store);
      }
      return {
        ok: true,
        message: opts?.allow !== false ? `${store} autorisé` : `${store} retiré`,
      };
    }
    default:
      return { ok: false, message: "Commande inconnue" };
  }
}
