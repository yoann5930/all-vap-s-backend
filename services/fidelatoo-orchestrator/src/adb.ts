import { spawnSync } from "node:child_process";

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

export function startActivity(packageName: string, serial?: string): { ok: boolean; message: string } {
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
  const child = spawnSync(emulator, ["-avd", avdName, "-no-snapshot-load"], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
    detached: true,
    stdio: "ignore",
  });
  // detached start often returns quickly / null status
  if (child.error) {
    return { ok: false, message: `Émulateur: ${child.error.message}` };
  }
  return { ok: true, message: `Démarrage AVD demandé: ${avdName}` };
}
