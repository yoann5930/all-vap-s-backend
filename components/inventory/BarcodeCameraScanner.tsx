"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrowserCodeReader,
  BrowserMultiFormatOneDReader,
} from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import {
  detectTorchSupport,
  setCameraTorch,
} from "@/lib/inventory/camera-torch";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Appelé à chaque code détecté. Retourner false pour mettre le scan en pause / fermer. */
  onDetected: (code: string) => void | boolean | Promise<void | boolean>;
  /** Mode continu : la caméra reste ouverte (défaut true). */
  continuous?: boolean;
  /**
   * Optionnel — échantillon visuel quand AUCUN code-barres n’est trouvé sur la frame.
   * N’altère pas le chemin de détection EAN (appelé seulement si decodeFrame renvoie null).
   * Le canvas fourni est un crop produit central (réutilisable pour matching).
   */
  onVisualSample?: (canvas: HTMLCanvasElement) => void | Promise<void>;
  /** Message de reconnaissance visuelle (ex. « Produit non reconnu ») — n’affecte pas l’EAN. */
  recognitionHint?: string | null;
  /** Intervalle mini entre analyses visuelles (ms). Défaut 300 (~3/s). */
  visualIntervalMs?: number;
};

type ScannerControls = { stop: () => void };

declare global {
  interface Window {
    BarcodeDetector?: new (options?: {
      formats?: string[];
    }) => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
    };
  }
}

const FORMATS_NATIVE = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
] as const;

function buildOneDHints() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
  ]);
  return hints;
}

function waitForVideoFrame(video: HTMLVideoElement, timeoutMs = 8000) {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Caméra démarrée mais aucune image reçue."));
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * Scanner inventaire — détection continue automatique via caméra.
 * Pas besoin de prendre une photo : le code est reconnu et renvoyé dès qu’il entre dans le cadre.
 */
export function BarcodeCameraScanner({
  open,
  onClose,
  onDetected,
  continuous = true,
  onVisualSample,
  recognitionHint = null,
  visualIntervalMs = 300,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualCanvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef<ScannerControls[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastCodeRef = useRef<string>("");
  const lastAtRef = useRef(0);
  const lastVisualAtRef = useRef(0);
  const visualBusyRef = useRef(false);
  const pausedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const continuousRef = useRef(continuous);
  const onVisualSampleRef = useRef(onVisualSample);
  const visualIntervalRef = useRef(visualIntervalMs);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState("Initialisation caméra…");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(true);
  const [torchHint, setTorchHint] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [count, setCount] = useState(0);

  onDetectedRef.current = onDetected;
  onCloseRef.current = onClose;
  continuousRef.current = continuous;
  onVisualSampleRef.current = onVisualSample;
  visualIntervalRef.current = Math.max(200, Math.min(500, visualIntervalMs));

  useEffect(() => {
    if (!open) return;

    busyRef.current = false;
    pausedRef.current = false;
    visualBusyRef.current = false;
    lastCodeRef.current = "";
    lastAtRef.current = 0;
    lastVisualAtRef.current = 0;
    setError(null);
    setTorchOn(false);
    setTorchAvailable(true);
    setTorchHint(null);
    setFlash(false);
    setRecent([]);
    setCount(0);
    setHint("Ouverture de la caméra…");

    let cancelled = false;

    function stopAll() {
      if (loopRef.current != null) {
        window.clearTimeout(loopRef.current);
        loopRef.current = null;
      }
      for (const c of controlsRef.current) {
        try {
          c.stop();
        } catch {
          /* ignore */
        }
      }
      controlsRef.current = [];
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    }

    async function succeed(code: string) {
      const cleaned = code.trim();
      if (!cleaned || cancelled || busyRef.current || pausedRef.current) return;

      const now = Date.now();
      // Anti-doublon : même code ignoré pendant 1,6 s (évite 50 enregistrements d’un même EAN)
      if (cleaned === lastCodeRef.current && now - lastAtRef.current < 1600) {
        return;
      }

      busyRef.current = true;
      lastCodeRef.current = cleaned;
      lastAtRef.current = now;

      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.(35);
        }
      } catch {
        /* ignore */
      }

      setFlash(true);
      window.setTimeout(() => setFlash(false), 180);
      setHint(`Détecté : ${cleaned}`);
      setRecent((prev) => [cleaned, ...prev.filter((c) => c !== cleaned)].slice(0, 6));
      setCount((n) => n + 1);

      try {
        const result = await onDetectedRef.current(cleaned);
        if (result === false) {
          pausedRef.current = true;
          setHint("Scan en pause — complétez la saisie puis rouvrez la caméra");
          onCloseRef.current();
          return;
        }
      } catch {
        setHint("Erreur à l’enregistrement — continuez le scan");
      }

      if (!continuousRef.current) {
        onCloseRef.current();
        return;
      }

      // Laisse le temps d’éloigner le produit avant la prochaine détection
      window.setTimeout(() => {
        busyRef.current = false;
        if (!cancelled) {
          setHint("Prêt — présentez le prochain code-barres");
        }
      }, 700);
    }

    async function decodeFrame(
      video: HTMLVideoElement,
      canvas: HTMLCanvasElement,
      zxingReader: BrowserMultiFormatOneDReader,
      nativeDetector: InstanceType<NonNullable<typeof window.BarcodeDetector>> | null
    ) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw < 40 || vh < 40) return null;

      const crops = [
        {
          sx: Math.floor(vw * 0.04),
          sy: Math.floor(vh * 0.3),
          cw: Math.floor(vw * 0.92),
          ch: Math.floor(vh * 0.4),
        },
        { sx: 0, sy: 0, cw: vw, ch: vh },
      ];

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;

      if (nativeDetector) {
        try {
          for (const crop of crops) {
            canvas.width = crop.cw;
            canvas.height = crop.ch;
            ctx.drawImage(video, crop.sx, crop.sy, crop.cw, crop.ch, 0, 0, crop.cw, crop.ch);
            const codes = await nativeDetector.detect(canvas);
            const raw = codes[0]?.rawValue?.trim();
            if (raw) return raw;
          }
        } catch {
          /* continue ZXing */
        }
      }

      try {
        const crop = crops[0];
        canvas.width = crop.cw;
        canvas.height = crop.ch;
        ctx.drawImage(video, crop.sx, crop.sy, crop.cw, crop.ch, 0, 0, crop.cw, crop.ch);
        const result = zxingReader.decodeFromCanvas(canvas);
        const text = result.getText()?.trim();
        if (text) return text;
      } catch {
        /* pas de code sur cette frame */
      }

      return null;
    }

    function startFrameLoop() {
      const zxingReader = new BrowserMultiFormatOneDReader(buildOneDHints());
      let nativeDetector: InstanceType<NonNullable<typeof window.BarcodeDetector>> | null =
        null;
      if (typeof window.BarcodeDetector === "function") {
        try {
          nativeDetector = new window.BarcodeDetector({ formats: [...FORMATS_NATIVE] });
        } catch {
          nativeDetector = null;
        }
      }

      const tick = async () => {
        if (cancelled) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (
          video &&
          canvas &&
          !busyRef.current &&
          !pausedRef.current &&
          video.readyState >= 2
        ) {
          try {
            const code = await decodeFrame(video, canvas, zxingReader, nativeDetector);
            if (code) {
              await succeed(code);
            } else if (
              onVisualSampleRef.current &&
              !visualBusyRef.current &&
              Date.now() - lastVisualAtRef.current > visualIntervalRef.current
            ) {
              // Chemin parallèle uniquement : aucun EAN sur cette frame
              // Analyse en mémoire uniquement — aucune image enregistrée
              const visualCanvas = visualCanvasRef.current;
              if (visualCanvas) {
                const vw = video.videoWidth;
                const vh = video.videoHeight;
                const side = Math.floor(Math.min(vw, vh) * 0.72);
                const sx = Math.floor((vw - side) / 2);
                const sy = Math.floor((vh - side) / 2);
                const size = 192;
                visualCanvas.width = size;
                visualCanvas.height = size;
                const vctx = visualCanvas.getContext("2d", {
                  willReadFrequently: true,
                });
                if (vctx && side > 40) {
                  vctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
                  lastVisualAtRef.current = Date.now();
                  visualBusyRef.current = true;
                  try {
                    await onVisualSampleRef.current(visualCanvas);
                  } catch {
                    /* ignore matching errors */
                  } finally {
                    visualBusyRef.current = false;
                  }
                }
              }
            }
          } catch {
            /* frame skip */
          }
        }
        if (!cancelled) {
          loopRef.current = window.setTimeout(() => {
            void tick();
          }, 90);
        }
      };
      loopRef.current = window.setTimeout(() => {
        void tick();
      }, 150);
    }

    async function openCamera(): Promise<MediaStream> {
      const attempts: MediaStreamConstraints[] = [
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        { audio: false, video: { facingMode: "environment" } },
        { audio: false, video: true },
      ];
      let lastError: unknown;
      for (const constraints of attempts) {
        try {
          return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("Impossible d’ouvrir la caméra");
    }

    async function start() {
      let video = videoRef.current;
      for (let i = 0; i < 20 && !video; i++) {
        await new Promise((r) => setTimeout(r, 50));
        if (cancelled) return;
        video = videoRef.current;
      }
      if (!video) {
        setError("Élément vidéo introuvable.");
        return;
      }

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Caméra non disponible (HTTPS requis).");
          return;
        }

        const stream = await openCamera();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        setTorchAvailable(detectTorchSupport(track));

        if (track) {
          try {
            await track.applyConstraints({
              // @ts-expect-error focusMode avancé
              advanced: [{ focusMode: "continuous" }],
            });
          } catch {
            /* non supporté */
          }
        }

        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        try {
          await video.play();
        } catch {
          /* autoplay policies */
        }

        await waitForVideoFrame(video).catch(() => undefined);
        if (cancelled) return;

        setHint(
          onVisualSampleRef.current
            ? "Analyse continue — EAN ou produit devant la caméra"
            : "Détection automatique — cadrez le code dans le rectangle"
        );
        // Boucle unique (BarcodeDetector natif + ZXing canvas) — pas de 2ᵉ flux caméra
        startFrameLoop();
      } catch (e) {
        const msg =
          e instanceof Error && /NotAllowed|Permission/i.test(e.message)
            ? "Autorisez l’accès à la caméra dans les paramètres du navigateur."
            : e instanceof Error && /NotFound|DevicesNotFound/i.test(e.message)
              ? "Aucune caméra détectée sur cet appareil."
              : e instanceof Error
                ? e.message
                : "Impossible d’ouvrir la caméra";
        setError(msg);
        stopAll();
      }
    }

    void start();
    return () => {
      cancelled = true;
      stopAll();
    };
  }, [open]);

  async function toggleTorch() {
    const stream = streamRef.current;
    const track = stream?.getVideoTracks()[0];
    if (!track) {
      setTorchHint("Caméra non prête — réessayez dans 1 seconde");
      return;
    }
    const next = !torchOn;
    // ZXing d’abord (certains Android)
    try {
      await BrowserCodeReader.mediaStreamSetTorch(track, next);
      setTorchOn(next);
      setTorchAvailable(true);
      setTorchHint(next ? "Flash allumé" : null);
      return;
    } catch {
      /* fallback natif */
    }
    const result = await setCameraTorch(track, next);
    if (result.ok) {
      setTorchOn(result.on);
      setTorchAvailable(true);
      setTorchHint(result.on ? "Flash allumé" : null);
      return;
    }
    setTorchOn(false);
    if (result.unsupported) setTorchAvailable(false);
    setTorchHint(result.message || "Flash non disponible sur cet appareil");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div>
          <p className="text-sm font-semibold">Caméra intelligente</p>
          <p className="text-xs text-white/70">{hint}</p>
          {recognitionHint ? (
            <p className="mt-1 text-xs font-semibold text-amber-300">{recognitionHint}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold backdrop-blur"
        >
          Fermer
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-contain bg-black"
          playsInline
          muted
          autoPlay
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden />
        <canvas ref={visualCanvasRef} className="hidden" aria-hidden />
        <div
          className={`pointer-events-none absolute inset-0 transition-colors duration-150 ${
            flash ? "bg-emerald-400/25" : "bg-transparent"
          }`}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-40 w-[88%] max-w-md">
            <div className="absolute inset-0 rounded-2xl border-2 border-emerald-400/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            <div className="absolute left-4 right-4 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-300/80" />
          </div>
        </div>
        {count > 0 ? (
          <div className="absolute right-3 top-3 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
            {count} scanné{count > 1 ? "s" : ""}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 bg-black px-4 py-3">
        {recent.length > 0 ? (
          <ul className="max-h-20 space-y-1 overflow-y-auto text-xs text-emerald-200/90">
            {recent.map((c, i) => (
              <li key={`${c}-${i}`}>✓ {c}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void toggleTorch()}
            className={`min-w-[7rem] rounded-xl px-3 py-2.5 text-sm font-semibold text-white ${
              torchOn ? "bg-amber-500" : "bg-white/15"
            } ${!torchAvailable && !torchOn ? "opacity-80" : ""}`}
            aria-pressed={torchOn}
            aria-label={torchOn ? "Éteindre le flash" : "Allumer le flash"}
          >
            {torchOn ? "Flash ON" : "Flash"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white"
          >
            Terminer le scan
          </button>
        </div>
        {torchHint ? (
          <p className="text-center text-xs text-amber-200">{torchHint}</p>
        ) : null}
      </div>

      {error ? (
        <div className="bg-red-600 px-4 py-3 text-sm text-white">{error}</div>
      ) : (
        <p className="bg-black px-4 pb-4 text-center text-xs text-white/75">
          {onVisualSample
            ? "Aucune photo enregistrée — analyse du flux en mémoire (EAN + reconnaissance produit). Saisissez ensuite uniquement la quantité."
            : "Aucune photo à prendre : présentez chaque code-barres dans le cadre — détection automatique."}
        </p>
      )}
    </div>
  );
}
