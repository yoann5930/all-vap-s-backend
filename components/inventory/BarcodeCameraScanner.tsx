"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
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

function buildZxingHints() {
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,
  ]);
  return hints;
}

/**
 * Scanner caméra fiable :
 * - ZXing gère le flux caméra (decodeFromConstraints)
 * - BarcodeDetector natif en parallèle si disponible (Chrome Android)
 */
export function BarcodeCameraScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const timerRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState("Initialisation caméra…");

  onDetectedRef.current = onDetected;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    lockedRef.current = false;
    setError(null);
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
            // Crop central (zone du cadre) pour améliorer la détection 1D
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            const cw = Math.floor(vw * 0.85);
            const ch = Math.floor(vh * 0.35);
            const sx = Math.floor((vw - cw) / 2);
            const sy = Math.floor((vh - ch) / 2);
            canvas.width = cw;
            canvas.height = ch;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, sx, sy, cw, ch, 0, 0, cw, ch);
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
        }, 180);
      };

      timerRef.current = window.setTimeout(() => {
        void tick();
      }, 250);
    }

    async function start() {
      const video = videoRef.current;
      if (!video) return;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Caméra non disponible sur cet appareil.");
          return;
        }

        const reader = new BrowserMultiFormatReader(buildZxingHints(), {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 800,
        });

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            // @ts-expect-error - non standard but useful on Android Chrome
            focusMode: "continuous",
          },
        };

        setHint("Cadrez le code-barres dans le rectangle vert");
        const controls = await reader.decodeFromConstraints(
          constraints,
          video,
          (result) => {
            if (cancelled || lockedRef.current) return;
            if (result) {
              succeed(result.getText());
            }
          }
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        void startNativeDetectorLoop();
      } catch (e) {
        // Fallback plus permissif si facingMode environment échoue
        try {
          const reader = new BrowserMultiFormatReader(buildZxingHints(), {
            delayBetweenScanAttempts: 120,
          });
          const controls = await reader.decodeFromConstraints(
            { audio: false, video: true },
            video,
            (result) => {
              if (cancelled || lockedRef.current) return;
              if (result) succeed(result.getText());
            }
          );
          if (cancelled) {
            controls.stop();
            return;
          }
          controlsRef.current = controls;
          setHint("Cadrez le code-barres (caméra de secours)");
          void startNativeDetectorLoop();
        } catch (e2) {
          const msg =
            e2 instanceof Error && /NotAllowed|Permission/i.test(e2.message)
              ? "Autorisez l’accès à la caméra dans les paramètres du navigateur."
              : e2 instanceof Error
                ? e2.message
                : e instanceof Error
                  ? e.message
                  : "Impossible d’ouvrir la caméra";
          setError(msg);
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      try {
        controlsRef.current?.stop();
      } catch {
        /* ignore */
      }
      controlsRef.current = null;
      const v = videoRef.current;
      if (v) {
        const stream = v.srcObject as MediaStream | null;
        stream?.getTracks().forEach((t) => t.stop());
        v.srcObject = null;
      }
    };
  }, [open]);

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
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-36 w-[82%] max-w-sm">
            <div className="absolute inset-0 rounded-2xl border-2 border-emerald-400/95" />
            <div className="absolute left-3 right-3 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-300/80" />
          </div>
        </div>
      </div>

      {error ? (
        <div className="bg-red-600 px-4 py-3 text-sm text-white">{error}</div>
      ) : (
        <p className="bg-black px-4 py-3 text-center text-xs text-white/75">
          Tenez le téléphone stable, code bien éclairé, horizontal dans le cadre.
          La détection est automatique.
        </p>
      )}
    </div>
  );
}
