import {
  clearQr,
  getState,
  setQr,
  snapshot,
  touch,
  type StoreCode,
} from "./state.js";
import {
  isAppInForeground,
  isPackageInstalled,
  killEmulator,
  listDevices,
  onlineDevice,
  screencapPngBase64,
  startActivity,
  tryStartAvd,
} from "./adb.js";
import {
  agentPublicStatus,
  observeScreen,
  recoverEnvironment,
  runAutonomousQrScenario,
} from "./agent.js";
import { appendJournal, getAgent, readJournal, saveAgent } from "./journal.js";
import { applyIdentityToRuntime, loadIdentity, syncIdentityFromDevice } from "./identity.js";

const ALLOWED = new Set([
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
  "ava.observe",
  "ava.autonomous_qr",
  "ava.agent_status",
  "ava.journal",
  "ava.sync_identity",
  "status",
]);

function avaEmail(): string {
  return (process.env.FIDELATOO_AVA_ACCOUNT_EMAIL || "avaallvaps@gmail.com").trim().toLowerCase();
}

function packageName(): string {
  return (process.env.FIDELATOO_ANDROID_PACKAGE || "fr.squirrel.fidelatoopro").trim();
}

function qrTtlSec(): number {
  return Math.min(Math.max(Number(process.env.QR_TTL_SEC || 120) || 120, 30), 600);
}

function refreshVmFromAdb(): void {
  const s = getState();
  const devices = listDevices();
  const online = devices.find((d) => d.state === "device");
  if (online) {
    s.vm = "online";
    s.lastError = null;
    const pkg = packageName();
    if (!isPackageInstalled(pkg, online.id)) {
      s.app = "unknown";
      s.lastError = `Fidelatoo non installé (${pkg})`;
    } else if (isAppInForeground(pkg, online.id)) {
      s.app = "open";
    } else if (s.app !== "open") {
      s.app = "installed";
    }
  } else if (devices.some((d) => d.state === "offline" || d.state === "unauthorized")) {
    s.vm = "error";
    s.lastError = "Appareil ADB offline/unauthorized";
  } else if (s.vm !== "starting") {
    s.vm = "stopped";
  }
  touch();
}

export function runCommand(
  command: string,
  extras?: { store?: StoreCode; allow?: boolean; actionId?: string }
): {
  ok: boolean;
  actionId: string;
  command: string;
  message: string;
  status: ReturnType<typeof snapshot>;
  qrImageBase64?: string | null;
  qrMime?: string | null;
  qrExpiresAt?: string | null;
  agent?: Record<string, unknown>;
  journal?: unknown[];
  identity?: Record<string, unknown>;
} {
  const actionId = extras?.actionId || `local-${Date.now()}`;
  if (!ALLOWED.has(command)) {
    return {
      ok: false,
      actionId,
      command,
      message: "Commande non autorisée",
      status: snapshot(avaEmail()),
    };
  }

  const s = getState();
  refreshVmFromAdb();
  // Toujours exposer l'identité persistée (source Fidelatoo) si déjà sync
  applyIdentityToRuntime(loadIdentity());

  switch (command) {
    case "status":
      return {
        ok: true,
        actionId,
        command,
        message: "OK",
        status: snapshot(avaEmail()),
        identity: loadIdentity() as unknown as Record<string, unknown>,
      };

    case "vm.start": {
      const online = onlineDevice();
      if (online) {
        s.vm = "online";
        s.lastError = null;
        touch();
        return {
          ok: true,
          actionId,
          command,
          message: `Appareil Android en ligne (${online.id})`,
          status: snapshot(avaEmail()),
        };
      }
      const avd = (process.env.ANDROID_AVD_NAME || "").trim();
      if (!avd) {
        s.vm = "stopped";
        s.lastError = "Aucun device ADB. Démarrez la VM/émulateur ou branchez l'appareil.";
        touch();
        return {
          ok: false,
          actionId,
          command,
          message: s.lastError,
          status: snapshot(avaEmail()),
        };
      }
      s.vm = "starting";
      touch();
      const started = tryStartAvd(avd);
      if (!started.ok) {
        s.vm = "error";
        s.lastError = started.message;
        touch();
        return { ok: false, actionId, command, message: started.message, status: snapshot(avaEmail()) };
      }
      // Attente boot réelle (jusqu'à ~90s) — ne pas inventer "online"
      const bootDeadline = Date.now() + 90_000;
      while (Date.now() < bootDeadline) {
        const after = onlineDevice();
        if (after) {
          s.vm = "online";
          s.lastError = null;
          touch();
          return {
            ok: true,
            actionId,
            command,
            message: `VM en ligne (${after.id})`,
            status: snapshot(avaEmail()),
          };
        }
        const pauseUntil = Date.now() + 2000;
        while (Date.now() < pauseUntil) {
          /* wait boot */
        }
      }
      s.vm = "starting";
      s.lastError = "AVD lancé, device pas encore prêt — réessayez status dans quelques secondes";
      touch();
      return {
        ok: false,
        actionId,
        command,
        message: s.lastError,
        status: snapshot(avaEmail()),
      };
    }

    case "vm.stop": {
      const online = onlineDevice();
      if (!online) {
        s.vm = "stopped";
        s.app = "closed";
        s.lastError = null;
        touch();
        return {
          ok: true,
          actionId,
          command,
          message: "Aucun device — considéré arrêté",
          status: snapshot(avaEmail()),
        };
      }
      const killed = killEmulator(online.id);
      if (!killed.ok) {
        s.lastError = killed.message;
        touch();
        return {
          ok: false,
          actionId,
          command,
          message: killed.message,
          status: snapshot(avaEmail()),
        };
      }
      s.vm = "stopped";
      s.app = "closed";
      s.lastError = null;
      touch();
      return {
        ok: true,
        actionId,
        command,
        message: killed.message,
        status: snapshot(avaEmail()),
      };
    }

    case "vm.restart": {
      const before = onlineDevice();
      if (before) {
        const stop = killEmulator(before.id);
        if (!stop.ok) {
          s.lastError = stop.message;
          touch();
          return {
            ok: false,
            actionId,
            command,
            message: stop.message,
            status: snapshot(avaEmail()),
          };
        }
        s.vm = "stopped";
        s.app = "closed";
        touch();
      }
      return runCommand("vm.start", { actionId });
    }

    case "vm.remote_open": {
      if (!onlineDevice()) {
        return {
          ok: false,
          actionId,
          command,
          message: "Device hors ligne — accès distant impossible",
          status: snapshot(avaEmail()),
        };
      }
      return {
        ok: true,
        actionId,
        command,
        message: "Device ADB prêt (scrcpy/remote à ouvrir localement sur la machine hôte — non exposé Internet)",
        status: snapshot(avaEmail()),
      };
    }

    case "app.open": {
      const device = onlineDevice();
      if (!device) {
        return {
          ok: false,
          actionId,
          command,
          message: "Device hors ligne — impossible d'ouvrir Fidelatoo",
          status: snapshot(avaEmail()),
        };
      }
      const opened = startActivity(packageName(), device.id);
      if (!opened.ok) {
        s.app = "unknown";
        s.lastError = opened.message;
        touch();
        return { ok: false, actionId, command, message: opened.message, status: snapshot(avaEmail()) };
      }
      s.app = "open";
      s.lastError = null;
      touch();
      return { ok: true, actionId, command, message: opened.message, status: snapshot(avaEmail()) };
    }

    case "ava.start_registration": {
      if (s.vm !== "online") {
        return {
          ok: false,
          actionId,
          command,
          message: "VM hors ligne",
          status: snapshot(avaEmail()),
        };
      }
      const device = onlineDevice();
      if (!device) {
        return {
          ok: false,
          actionId,
          command,
          message: "Device hors ligne",
          status: snapshot(avaEmail()),
        };
      }
      // A.V.A. pilote l'ouverture de Fidelatoo Commerçant elle-même
      const opened = startActivity(packageName(), device.id);
      if (!opened.ok) {
        s.lastError = opened.message;
        touch();
        return { ok: false, actionId, command, message: opened.message, status: snapshot(avaEmail()) };
      }
      s.app = "open";
      s.ava = "registration_in_progress";
      s.role = "none";
      s.lastError = null;
      clearQr();
      touch();
      return {
        ok: true,
        actionId,
        command,
        message: `A.V.A. a ouvert Fidelatoo — inscription ${avaEmail()} (rejoindre un commerce existant)`,
        status: snapshot(avaEmail()),
      };
    }

    case "ava.continue_to_qr":
    case "ava.qr_image": {
      const device = onlineDevice();
      if (!device) {
        return {
          ok: false,
          actionId,
          command,
          message: "Device hors ligne — pas de QR réel",
          status: snapshot(avaEmail()),
        };
      }
      const shot = screencapPngBase64(device.id);
      if (!shot.ok) {
        s.lastError = shot.message;
        touch();
        return { ok: false, actionId, command, message: shot.message, status: snapshot(avaEmail()) };
      }
      const expiresAt = setQr(shot.base64, "image/png", qrTtlSec());
      s.ava = "awaiting_scan";
      s.lastError = null;
      touch();
      return {
        ok: true,
        actionId,
        command,
        message: "Capture écran Android réelle transmise (QR collaboratrice si affiché à l'écran)",
        status: snapshot(avaEmail()),
        qrImageBase64: shot.base64,
        qrMime: "image/png",
        qrExpiresAt: expiresAt,
      };
    }

    case "ava.qr_status": {
      const snap = snapshot(avaEmail());
      return {
        ok: true,
        actionId,
        command,
        message: snap.qrAvailable ? "QR disponible" : "Aucun QR",
        status: snap,
      };
    }

    case "ava.qr_scanned": {
      clearQr();
      s.ava = "collaborator_active";
      s.role = "collaboratrice";
      touch();
      return {
        ok: true,
        actionId,
        command,
        message: "Scan confirmé — QR éphémère effacé",
        status: snapshot(avaEmail()),
      };
    }

    case "ava.verify_role": {
      // Re-sync depuis la VM avant de conclure (même source que Admin Fidelatoo)
      const synced = syncIdentityFromDevice(actionId);
      const ok = getState().role === "collaboratrice";
      return {
        ok,
        actionId,
        command,
        message: ok
          ? `Collaboratrice OK · boutiques: ${getState().stores.join(", ") || synced.identity.businessName || "aucune"} · perms: ${synced.identity.permissions.join(", ") || "n/a"}`
          : synced.message || "Rôle Collaboratrice non confirmé",
        status: snapshot(avaEmail()),
        identity: synced.identity as unknown as Record<string, unknown>,
      };
    }

    case "ava.test_login": {
      if (s.ava === "suspended" || s.ava === "blocked") {
        return {
          ok: false,
          actionId,
          command,
          message: "Compte suspendu ou bloqué",
          status: snapshot(avaEmail()),
        };
      }
      if (!onlineDevice()) {
        return {
          ok: false,
          actionId,
          command,
          message: "Device hors ligne — reconnexion non testable",
          status: snapshot(avaEmail()),
        };
      }
      return {
        ok: true,
        actionId,
        command,
        message: "Device en ligne — test reconnexion possible côté app",
        status: snapshot(avaEmail()),
      };
    }

    case "ava.suspend":
      s.ava = "suspended";
      saveAgent({ suspended: true, nextAction: null, lastAction: "suspend" });
      appendJournal({
        actionId,
        mode: "admin",
        action: "suspend",
        why: "Suspension admin",
        result: "ok",
      });
      touch();
      return { ok: true, actionId, command, message: "A.V.A. suspendue", status: snapshot(avaEmail()) };

    case "ava.revoke":
      s.ava = "blocked";
      s.role = "none";
      s.stores = [];
      clearQr();
      saveAgent({ suspended: true, lastAction: "revoke", nextAction: null });
      appendJournal({
        actionId,
        mode: "admin",
        action: "revoke",
        why: "Révocation sessions/droits",
        result: "ok",
      });
      touch();
      return { ok: true, actionId, command, message: "Accès A.V.A. révoqué", status: snapshot(avaEmail()) };

    case "ava.recover": {
      // Reprendre = lever suspension + relancer app si possible
      saveAgent({ suspended: false, lastAction: "recover" });
      const recovered = recoverEnvironment(actionId);
      s.ava = recovered.ok ? "registration_in_progress" : s.ava;
      if (recovered.ok) s.role = "none";
      touch();
      return {
        ok: recovered.ok,
        actionId,
        command,
        message: recovered.message,
        status: snapshot(avaEmail()),
      };
    }

    case "ava.observe": {
      if (getAgent().suspended) {
        return {
          ok: false,
          actionId,
          command,
          message: "A.V.A. suspendue",
          status: snapshot(avaEmail()),
        };
      }
      const obs = observeScreen(actionId, "admin");
      return {
        ok: obs.ok,
        actionId,
        command,
        message: obs.message,
        status: snapshot(avaEmail()),
      };
    }

    case "ava.autonomous_qr": {
      if (getAgent().suspended) {
        return {
          ok: false,
          actionId,
          command,
          message: "A.V.A. suspendue",
          status: snapshot(avaEmail()),
        };
      }
      const run = runAutonomousQrScenario(actionId);
      return {
        ok: run.ok,
        actionId,
        command,
        message: run.message,
        status: snapshot(avaEmail()),
        qrImageBase64: run.qrImageBase64,
        qrMime: run.qrMime,
        qrExpiresAt: run.qrExpiresAt,
      };
    }

    case "ava.agent_status": {
      const agent = agentPublicStatus();
      return {
        ok: true,
        actionId,
        command,
        message: agent.suspended ? "SUSPENDED" : agent.online ? "ONLINE" : "OFFLINE",
        status: snapshot(avaEmail()),
        agent: agent as unknown as Record<string, unknown>,
      };
    }

    case "ava.journal": {
      const entries = readJournal(50);
      return {
        ok: true,
        actionId,
        command,
        message: `${entries.length} entrées`,
        status: snapshot(avaEmail()),
        journal: entries,
      };
    }

    case "ava.sync_identity": {
      if (getAgent().suspended) {
        return {
          ok: false,
          actionId,
          command,
          message: "A.V.A. suspendue",
          status: snapshot(avaEmail()),
        };
      }
      const synced = syncIdentityFromDevice(actionId);
      return {
        ok: synced.ok,
        actionId,
        command,
        message: synced.message,
        status: snapshot(avaEmail()),
        identity: synced.identity as unknown as Record<string, unknown>,
      };
    }

    case "ava.authorize_store":
    case "ava.revoke_store": {
      const store = extras?.store;
      if (!store) {
        return {
          ok: false,
          actionId,
          command,
          message: "Boutique manquante",
          status: snapshot(avaEmail()),
        };
      }
      const allow = command === "ava.authorize_store" ? extras?.allow !== false : false;
      if (allow) {
        if (!s.stores.includes(store)) s.stores.push(store);
      } else {
        s.stores = s.stores.filter((x) => x !== store);
      }
      touch();
      return {
        ok: true,
        actionId,
        command,
        message: allow ? `${store} autorisé` : `${store} retiré`,
        status: snapshot(avaEmail()),
      };
    }

    default:
      return {
        ok: false,
        actionId,
        command,
        message: "Commande inconnue",
        status: snapshot(avaEmail()),
      };
  }
}

export function healthPayload() {
  refreshVmFromAdb();
  const devices = listDevices();
  return {
    ok: true,
    service: "allvaps-fidelatoo-orchestrator",
    mock: false,
    devices: devices.map((d) => ({ id: d.id, state: d.state })),
    status: snapshot(avaEmail()),
  };
}
