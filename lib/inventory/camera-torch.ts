/**
 * Contrôle flash / torche caméra — Android / Samsung / Chrome.
 * iOS Safari ne expose généralement pas la torche : message explicite.
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

/** Détecte si la piste vidéo annonce un support torche. */
export function detectTorchSupport(track: MediaStreamTrack | null | undefined): boolean {
  if (!track) return false;
  try {
    const caps = track.getCapabilities?.() as
      | { torch?: boolean; fillLightMode?: string[] }
      | undefined;
    if (caps?.torch) return true;
    if (Array.isArray(caps?.fillLightMode) && caps.fillLightMode.includes("flash")) {
      return true;
    }
  } catch {
    /* ignore */
  }
  // Sur Android on tente quand même au clic (caps parfois vides)
  return !isIos();
}

/**
 * Active / coupe le flash. Essaie plusieurs contraintes (torch, fillLightMode).
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

  const attempts: MediaTrackConstraints[] = [
    // @ts-expect-error torch non standardisé partout
    { advanced: [{ torch: on }] },
    // @ts-expect-error torch top-level (Chrome Android)
    { torch: on },
    // @ts-expect-error fillLightMode
    { advanced: [{ fillLightMode: on ? "flash" : "off" }] },
    // @ts-expect-error fillLightMode top-level
    { fillLightMode: on ? "flash" : "off" },
  ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      await track.applyConstraints(constraints);
      return { ok: true, on };
    } catch (e) {
      lastError = e;
    }
  }

  return {
    ok: false,
    on: false,
    unsupported: true,
    message:
      lastError instanceof Error
        ? `Flash indisponible : ${lastError.message}`
        : "Flash non supporté par cet appareil / navigateur",
  };
}
