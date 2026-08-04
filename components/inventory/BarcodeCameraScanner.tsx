"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrowserCodeReader,
  BrowserMultiFormatOneDReader,
} from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
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
 * Scanner caméra inventaire :
 * - Flux unique getUserMedia (pas de double ouverture)
 * - ZXing 1D (EAN/UPC) en priorité + MultiFormat en secours
 * - BarcodeDetector natif en parallèle (Chrome Android)
 * - Cadrage object-contain = ce que l’on voit = ce qui est décodé
 */
export function BarcodeCameraScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef<ScannerControls[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState("Initialisation caméra…");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  onDetectedRef.current = onDetected;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    lockedRef.current = false;
    setError(null);
    setTorchOn(false);
    setTorchAvailable(false);
    setHint("Ouverture de la caméra…");

    let cancelled = false;

    function succeed(code: string) {
      const cleaned = code.trim();
      if (!cleaned || lockedRef.current || cancelled) return;
      lockedRef.current = true;
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.(40);
        }
      } catch {
        /* ignore */
      }
      setHint(`Détecté : ${cleaned}`);
      onDetectedRef.current(cleaned);
      onCloseRef.current();
    }

    function stopAll() {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
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
      if (video) {
        video.srcObject = null;
      }
    }

    async function startNativeDetectorLoop() {
      if (typeof window.BarcodeDetector !== "function") return;
      let detector: InstanceType<NonNullable<typeof window.BarcodeDetector>>;
      try {
        detector = new window.BarcodeDetector({
          formats: [
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
            "code_128",
            "code_39",
            "itf",
            "qr_code",
          ],
        });
      } catch {
        return;
      }

      const tick = async () => {
        if (cancelled || lockedRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
          try {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            // Bande centrale horizontale (codes 1D) + essai plein cadre
            const crops = [
              {
                sx: Math.floor(vw * 0.05),
                sy: Math.floor(vh * 0.32),
                cw: Math.floor(vw * 0.9),
                ch: Math.floor(vh * 0.36),
              },
              { sx: 0, sy: 0, cw: vw, ch: vh },
            ];
            for (const crop of crops) {
              canvas.width = crop.cw;
              canvas.height = crop.ch;
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              if (!ctx) continue;
              ctx.drawImage(
                video,
                crop.sx,
                crop.sy,
                crop.cw,
                crop.ch,
                0,
                0,
                crop.cw,
                crop.ch
              );
              const codes = await detector.detect(canvas);
              const raw = codes[0]?.rawValue?.trim();
              if (raw) {
                succeed(raw);
                return;
              }
            }
          } catch {
            /* frame skip */
          }
        }
        timerRef.current = window.setTimeout(() => {
          void tick();
        }, 120);
      };

      timerRef.current = window.setTimeout(() => {
        void tick();
      }, 200);
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
        {
          audio: false,
          video: { facingMode: "environment" },
        },
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

    async function startReaders(video: HTMLVideoElement, stream: MediaStream) {
      const options = {
        delayBetweenScanAttempts: 80,
        delayBetweenScanSuccess: 600,
        tryPlayVideoTimeout: 10000,
      };

      // Un seul decodeFromStream : stop() dispose le MediaStream
      const oneD = new BrowserMultiFormatOneDReader(buildOneDHints(), options);
      const controls = await oneD.decodeFromStream(
        stream,
        video,
        (result) => {
          if (cancelled || lockedRef.current || !result) return;
          succeed(result.getText());
        }
      );
      if (cancelled) {
        controls.stop();
        return;
      }
      controlsRef.current.push(controls);
    }

    async function start() {
      // Attendre que le <video> soit monté (open vient de passer à true)
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
          setError("Caméra non disponible sur cet appareil (HTTPS requis).");
          return;
        }

        const stream = await openCamera();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setTorchAvailable(BrowserCodeReader.mediaStreamIsTorchCompatible(stream));

        const track = stream.getVideoTracks()[0];
        if (track) {
          try {
            await track.applyConstraints({
              // @ts-expect-error - avancé Android Chrome
              advanced: [{ focusMode: "continuous" }],
            });
          } catch {
            /* non supporté */
          }
        }

        // ZXing attache le flux au <video> (un seul propriétaire)
        setHint("Cadrez le code-barres dans le rectangle — détection auto");
        await startReaders(video, stream);
        if (cancelled) return;
        await waitForVideoFrame(video).catch(() => undefined);
        void startNativeDetectorLoop();
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
    if (!track) return;
    const next = !torchOn;
    try {
      await BrowserCodeReader.mediaStreamSetTorch(track, next);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }

  async function decodeStillPhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      setError("Image caméra pas encore prête.");
      return;
    }
    setHint("Analyse de la photo…");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    try {
      if (typeof window.BarcodeDetector === "function") {
        const detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"],
        });
        const codes = await detector.detect(canvas);
        const raw = codes[0]?.rawValue?.trim();
        if (raw) {
          onDetectedRef.current(raw);
          onCloseRef.current();
          return;
        }
      }
    } catch {
      /* fallback zxing */
    }

    try {
      const reader = new BrowserMultiFormatOneDReader(buildOneDHints());
      const result = reader.decodeFromCanvas(canvas);
      const text = result.getText()?.trim();
      if (text) {
        onDetectedRef.current(text);
        onCloseRef.current();
        return;
      }
    } catch {
      /* no code */
    }

    setHint("Aucun code détecté — rapprochez-vous, éclairez, réessayez");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div>
          <p className="text-sm font-semibold">Scan code-barres</p>
          <p className="text-xs text-white/70">{hint}</p>
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
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-40 w-[88%] max-w-md">
            <div className="absolute inset-0 rounded-2xl border-2 border-emerald-400/95 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            <div className="absolute left-4 right-4 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-300/80" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 bg-black px-4 py-3">
        {torchAvailable ? (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            className="rounded-xl bg-white/15 px-3 py-2.5 text-sm font-semibold text-white"
          >
            {torchOn ? "Éteindre flash" : "Flash"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void decodeStillPhoto()}
          className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white"
        >
          Capturer maintenant
        </button>
      </div>

      {error ? (
        <div className="bg-red-600 px-4 py-3 text-sm text-white">{error}</div>
      ) : (
        <p className="bg-black px-4 pb-4 text-center text-xs text-white/75">
          Tenez le téléphone à ~10–20 cm, code bien éclairé, horizontal dans le cadre.
          Si rien ne se passe, appuyez sur « Capturer maintenant ».
        </p>
      )}
    </div>
  );
}
