import { spawn, spawnSync } from "node:child_process";

function adbBin(): string {
  return (process.env.ADB_PATH || "adb").trim() || "adb";
}

export function adb(args: string[], timeoutMs = 20_000): {
  ok: boolean;
  stdout: string;
  stderr: string;
  status: number | null;
} {
  const r = spawnSync(adbBin(), args, {
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
  });
  return {
    ok: r.status === 0,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    status: r.status,
  };
}

export type AdbDevice = { id: string; state: string; details: string };

export function listDevices(): AdbDevice[] {
  const r = adb(["devices", "-l"]);
  if (!r.ok && !r.stdout.includes("List of devices")) return [];
  const lines = r.stdout.split(/\r?\n/).slice(1);
  const out: AdbDevice[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\S+)\s+(\S+)(.*)$/);
    if (!m) continue;
    out.push({ id: m[1], state: m[2], details: (m[3] || "").trim() });
  }
  return out;
}

export function onlineDevice(): AdbDevice | null {
  return listDevices().find((d) => d.state === "device") || null;
}

export function screencapPngBase64(serial?: string): { ok: true; base64: string } | { ok: false; message: string } {
  const args = serial ? ["-s", serial, "exec-out", "screencap", "-p"] : ["exec-out", "screencap", "-p"];
  const r = spawnSync(adbBin(), args, {
    encoding: "buffer",
    timeout: 25_000,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0 || !r.stdout || (r.stdout as Buffer).length < 100) {
    return {
      ok: false,
      message: `screencap ADB échoué: ${(r.stderr || Buffer.alloc(0)).toString("utf8").slice(0, 200)}`,
    };
  }
  return { ok: true, base64: (r.stdout as Buffer).toString("base64") };
}

export function isPackageInstalled(packageName: string, serial?: string): boolean {
  const args = [...(serial ? ["-s", serial] : []), "shell", "pm", "path", packageName];
  const r = adb(args);
  return r.ok && /package:/.test(r.stdout);
}

export function isAppInForeground(packageName: string, serial?: string): boolean {
  const args = [...(serial ? ["-s", serial] : []), "shell", "dumpsys", "window"];
  const r = adb(args, 12_000);
  if (!r.ok) return false;
  const focus = r.stdout.match(/mCurrentFocus=Window\{[^ ]+ u0 ([^\s}/]+)/);
  return !!focus && focus[1] === packageName;
}

export function startActivity(packageName: string, serial?: string): { ok: boolean; message: string } {
  if (!isPackageInstalled(packageName, serial)) {
    return {
      ok: false,
      message: `Application absente sur le device (${packageName}). Installez Fidelatoo Commerçant.`,
    };
  }
  const args = [
    ...(serial ? ["-s", serial] : []),
    "shell",
    "monkey",
    "-p",
    packageName,
    "-c",
    "android.intent.category.LAUNCHER",
    "1",
  ];
  const r = adb(args);
  if (!r.ok) {
    return { ok: false, message: `Ouverture app échouée: ${(r.stderr || r.stdout).slice(0, 240)}` };
  }
  return { ok: true, message: `Application lancée: ${packageName}` };
}

export function tryStartAvd(avdName: string): { ok: boolean; message: string } {
  const emulator =
    process.env.EMULATOR_PATH ||
    (process.env.ANDROID_HOME
      ? `${process.env.ANDROID_HOME}\\emulator\\emulator.exe`
      : "emulator");
  const snapshot = (process.env.ANDROID_AVD_SNAPSHOT || "stable").trim();
  const skin = (process.env.ANDROID_AVD_SKIN || "720x1280").trim();
  // Snapshot rapide si dispo ; fenêtre masquée (pilotage arrière-plan).
  const args = [
    "-avd",
    avdName,
    "-skin",
    skin,
    "-gpu",
    "auto",
    "-netdelay",
    "none",
    "-netspeed",
    "full",
    ...(snapshot ? ["-snapshot", snapshot] : ["-no-snapshot-load"]),
  ];
  try {
    const child = spawn(emulator, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return {
      ok: true,
      message: `Démarrage AVD demandé: ${avdName}${snapshot ? ` (snapshot ${snapshot})` : ""}`,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Émulateur: ${err instanceof Error ? err.message : "échec démarrage"}`,
    };
  }
}

/** Arrêt AVD uniquement (jamais un téléphone physique). */
export function killEmulator(serial?: string): { ok: boolean; message: string } {
  const id = serial || onlineDevice()?.id;
  if (!id) {
    return { ok: true, message: "Aucun device — déjà arrêté" };
  }
  if (!/^emulator-/i.test(id)) {
    return {
      ok: false,
      message: `Arrêt refusé: ${id} n'est pas un émulateur AVD`,
    };
  }
  adb(["-s", id, "emu", "kill"], 15_000);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const still = listDevices().find((d) => d.id === id);
    if (!still || still.state === "disconnected") {
      return { ok: true, message: `Émulateur arrêté (${id})` };
    }
    const pauseUntil = Date.now() + 400;
    while (Date.now() < pauseUntil) {
      /* wait ADB */
    }
  }
  const leftover = listDevices().find((d) => d.id === id && d.state === "device");
  if (!leftover) {
    return { ok: true, message: `Émulateur arrêté (${id})` };
  }
  return {
    ok: false,
    message: `Émulateur encore présent (${id}) après emu kill`,
  };
}
