export type MicPermissionStatus = "unknown" | "prompting" | "granted" | "denied" | "unsupported";

export type BrowserKind = "chrome" | "edge" | "firefox" | "safari" | "other";

export interface MicPermissionResult {
  granted: boolean;
  status: MicPermissionStatus;
  denied?: boolean;
  message?: string;
  /** Stream optionnel — caller doit stopper les pistes s'il ne le conserve pas */
  stream?: MediaStream;
}

export type MicAudioConstraints = {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
};

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function detectBrowser(): BrowserKind {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return "safari";
  if (/Chrome\//.test(ua) || /Chromium\//.test(ua)) return "chrome";
  return "other";
}

export const BROWSER_MIC_HELP: Record<BrowserKind, string[]> = {
  chrome: [
    "Cliquez sur le cadenas à gauche de l'adresse du site",
    "Allez dans « Autorisations du site »",
    "Mettez « Micro » sur « Autoriser »",
    "Rechargez la page",
  ],
  edge: [
    "Cliquez sur le cadenas à gauche de l'adresse du site",
    "Allez dans « Autorisations du site »",
    "Mettez « Micro » sur « Autoriser »",
    "Rechargez la page",
  ],
  safari: [
    "Ouvrez « Réglages du site web » (Safari → Réglages pour ce site)",
    "Section « Micro »",
    "Choisissez « Autoriser »",
    "Rechargez la page",
  ],
  firefox: [
    "Cliquez sur l'icône micro ou cadenas dans la barre d'adresse",
    "Supprimez le blocage du micro",
    "Rechargez la page",
  ],
  other: [
    "Autorisez le micro dans les paramètres de votre navigateur",
    "Rechargez la page après modification",
  ],
};

export const MIC_MESSAGES = {
  prompt: "Autorisez le micro pour parler avec AVA — il sert uniquement à cette conversation",
  listening: "AVA vous écoute…",
  denied:
    "Micro non autorisé. Vous pouvez continuer par écrit — toutes les fonctions restent disponibles.",
  unsupported:
    "La reconnaissance vocale n'est pas disponible ici. Écrivez-moi, je suis là pour vous aider.",
  unavailable: "Micro indisponible. Vous pouvez m'écrire sans problème.",
} as const;

export async function requestMicPermission(
  options?: { audio?: boolean | MicAudioConstraints; keepStream?: boolean }
): Promise<MicPermissionResult> {
  if (!isSpeechRecognitionSupported()) {
    return {
      granted: false,
      status: "unsupported",
      message: MIC_MESSAGES.unsupported,
    };
  }

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { granted: true, status: "granted" };
  }

  const audio =
    options?.audio === false
      ? true
      : options?.audio ?? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio });
    if (options?.keepStream) {
      return { granted: true, status: "granted", stream };
    }
    stream.getTracks().forEach((t) => t.stop());
    return { granted: true, status: "granted" };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        granted: false,
        status: "denied",
        denied: true,
        message: MIC_MESSAGES.denied,
      };
    }
    if (name === "NotFoundError") {
      return {
        granted: false,
        status: "denied",
        message: "Aucun micro détecté sur cet appareil.",
      };
    }
    return {
      granted: false,
      status: "denied",
      message: MIC_MESSAGES.unavailable,
    };
  }
}

export async function queryMicPermission(): Promise<MicPermissionStatus> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }
  try {
    const result = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    if (result.state === "granted") return "granted";
    if (result.state === "denied") return "denied";
    return "unknown";
  } catch {
    return "unknown";
  }
}
