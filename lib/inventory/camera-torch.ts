/**
 * Contrôle flash / torche caméra — Android / Samsung / Chrome.
 * Vérifie TOUJOURS getSettings().torch après chaque tentative.
 * Ne revendique jamais « Flash ON » sans confirmation matérielle (ou caps torch).
 */

export type TorchResult = {
  ok: boolean;
  on: boolean;
  unsupported?: boolean;
  message?: string;
};

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function readTorchSetting(track: MediaStreamTrack): boolean | null {
  try {
    const s = track.getSettings?.() as { torch?: boolean } | undefined;
    if (typeof s?.torch === "boolean") return s.torch;
  } catch {
    /* ignore */
  }
  return null;
}

function supportsTorchCapability(track: MediaStreamTrack): boolean {
  try {
    const caps = track.getCapabilities?.() as
      | { torch?: boolean; fillLightMode?: string[] }
      | undefined;
    if (caps?.torch === true) return true;
    if (Array.isArray(caps?.fillLightMode)) {
      return caps.fillLightMode.some((m) => /flash|torch|on/i.test(m));
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Détecte si la piste vidéo peut supporter une torche. */
export function detectTorchSupport(track: MediaStreamTrack | null | undefined): boolean {
  if (!track) return false;
  if (isIos()) return false;
  if (supportsTorchCapability(track)) return true;
  // Android : caps parfois vides au démarrage — on autorise le bouton
  return !isIos();
}

function labelLooksRear(label: string): boolean {
  const l = label.toLowerCase();
  if (/front|user|selfie|face|avant/i.test(l)) return false;
  return /back|rear|environment|arri[eè]re|world|torch|flash/i.test(l);
}

/**
 * Ouvre la caméra arrière (idéalement celle qui a une torche).
 * Évite la selfie cam où le flash hardware n’existe pas.
 */
export async function openInventoryCamera(options?: {
  width?: number;
  height?: number;
}): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Caméra non disponible (HTTPS requis).");
  }

  const width = options?.width ?? 1920;
  const height = options?.height ?? 1080;

  // Permissions + labels devices
  let devices: MediaDeviceInfo[] = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    devices = [];
  }

  const videoInputs = devices.filter((d) => d.kind === "videoinput");
  const rearByLabel = videoInputs.filter((d) => d.label && labelLooksRear(d.label));
  const orderedIds = [
    ...rearByLabel.map((d) => d.deviceId),
    ...videoInputs
      .filter((d) => d.deviceId && !rearByLabel.some((r) => r.deviceId === d.deviceId))
      .map((d) => d.deviceId),
  ].filter(Boolean);

  const attempts: MediaStreamConstraints[] = [];

  for (const deviceId of orderedIds.slice(0, 6)) {
    attempts.push({
      audio: false,
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: width },
        height: { ideal: height },
      },
    });
  }

  attempts.push(
    {
      audio: false,
      video: {
        facingMode: { exact: "environment" },
        width: { ideal: width },
        height: { ideal: height },
      },
    },
    {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: width },
        height: { ideal: height },
      },
    },
    { audio: false, video: { facingMode: "environment" } },
    { audio: false, video: true }
  );

  let lastError: unknown;
  let bestWithoutTorch: MediaStream | null = null;

  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getVideoTracks()[0];
      if (track && supportsTorchCapability(track)) {
        bestWithoutTorch?.getTracks().forEach((t) => t.stop());
        return stream;
      }
      // Garde le premier flux environnement si aucune torche déclarée
      if (!bestWithoutTorch) {
        bestWithoutTorch = stream;
      } else {
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (bestWithoutTorch) return bestWithoutTorch;

  throw lastError instanceof Error
    ? lastError
    : new Error("Impossible d’ouvrir la caméra");
}

/**
 * Applique focus continu SANS écraser l’état torche.
 * (Sur Android, applyConstraints({focusMode}) sans torch peut éteindre le flash.)
 */
export async function applyContinuousFocus(
  track: MediaStreamTrack | null | undefined,
  keepTorchOn?: boolean
): Promise<void> {
  if (!track) return;
  try {
    const torch = keepTorchOn === true ? true : readTorchSetting(track) === true;
    if (torch) {
      await track.applyConstraints({
        // @ts-expect-error focusMode + torch
        advanced: [{ focusMode: "continuous", torch: true }],
      });
    } else {
      await track.applyConstraints({
        // @ts-expect-error focusMode
        advanced: [{ focusMode: "continuous" }],
      });
    }
  } catch {
    /* non supporté */
  }
}

/**
 * Active / coupe le flash matériel.
 * Ne renvoie ok:true QUE si getSettings().torch confirme, OU caps.torch + contrainte acceptée.
 */
export async function setCameraTorch(
  track: MediaStreamTrack | null | undefined,
  on: boolean
): Promise<TorchResult> {
  if (!track) {
    return { ok: false, on: false, message: "Caméra non prête" };
  }

  if (isIos()) {
    return {
      ok: false,
      on: false,
      unsupported: true,
      message: "Flash non disponible sur iPhone/iPad (limitation Safari)",
    };
  }

  if (track.readyState !== "live") {
    return { ok: false, on: false, message: "Caméra inactive — rouvrez le scan" };
  }

  const attempts: MediaTrackConstraints[] = [
    // Chrome / Samsung Android — forme la plus fiable
    // @ts-expect-error torch
    { advanced: [{ torch: on }] },
    // @ts-expect-error torch top-level
    { torch: on },
    // @ts-expect-error fillLightMode
    { advanced: [{ fillLightMode: on ? "flash" : "off" }] },
    // @ts-expect-error fillLightMode torch alias
    { advanced: [{ fillLightMode: on ? "torch" : "off" }] },
    // @ts-expect-error
    { fillLightMode: on ? "flash" : "off" },
  ];

  let lastError: unknown;
  let constraintAccepted = false;
  const hadTorchCap = supportsTorchCapability(track);

  for (const constraints of attempts) {
    try {
      await track.applyConstraints(constraints);
      constraintAccepted = true;
      // Laisse le driver appliquer
      await new Promise((r) => setTimeout(r, 100));
      const setting = readTorchSetting(track);
      if (setting === on) {
        return { ok: true, on, message: on ? "Flash allumé" : "Flash éteint" };
      }
    } catch (e) {
      lastError = e;
    }
  }

  // ImageCapture fillLightMode (Chrome) — torche continue parfois via setOptions
  try {
    const IC = (globalThis as unknown as { ImageCapture?: new (t: MediaStreamTrack) => unknown })
      .ImageCapture;
    if (typeof IC === "function") {
      const ic = new IC(track) as {
        getPhotoCapabilities?: () => Promise<{ fillLightMode?: string[] }>;
        setOptions?: (opts: { fillLightMode: string }) => Promise<void>;
      };
      if (typeof ic.getPhotoCapabilities === "function") {
        const caps = await ic.getPhotoCapabilities();
        const modes: string[] = caps?.fillLightMode || [];
        if (modes.length && typeof ic.setOptions === "function") {
          const mode = on
            ? modes.find((m) => /torch/i.test(m)) ||
              modes.find((m) => /flash/i.test(m)) ||
              modes[modes.length - 1]
            : modes.find((m) => /off/i.test(m)) || "off";
          await ic.setOptions({ fillLightMode: mode });
          await new Promise((r) => setTimeout(r, 100));
          const setting = readTorchSetting(track);
          if (setting === on) {
            return { ok: true, on, message: on ? "Flash allumé" : "Flash éteint" };
          }
          // Si caps torch déclarée et contrainte OK mais settings muet → accepter
          if (setting === null && hadTorchCap && constraintAccepted) {
            return {
              ok: true,
              on,
              message: on ? "Flash allumé" : "Flash éteint",
            };
          }
        }
      }
    }
  } catch (e) {
    lastError = e;
  }

  // Caps torch + contrainte acceptée + settings muet (certains Samsung)
  if (constraintAccepted && hadTorchCap && readTorchSetting(track) === null) {
    return {
      ok: true,
      on,
      message: on ? "Flash allumé" : "Flash éteint",
    };
  }

  // Re-vérifie une dernière fois (driver lent)
  await new Promise((r) => setTimeout(r, 120));
  if (readTorchSetting(track) === on) {
    return { ok: true, on, message: on ? "Flash allumé" : "Flash éteint" };
  }

  return {
    ok: false,
    on: false,
    unsupported: true,
    message:
      lastError instanceof Error
        ? `Flash indisponible : ${lastError.message}`
        : "Flash non supporté — utilisez la caméra arrière (pas selfie)",
  };
}
