"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

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

/**
 * Scanner caméra EAN/UPC/Code128 — BarcodeDetector natif si dispo, sinon ZXing.
 */
export function BarcodeCameraScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const lockedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState("Cadrez le code-barres…");

  useEffect(() => {
    if (!open) return;
    lockedRef.current = false;
    setError(null);
    setHint("Cadrez le code-barres…");

    let cancelled = false;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Caméra non disponible sur cet appareil.");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        if (typeof window.BarcodeDetector === "function") {
          setHint("Scan natif actif — cadrez le code");
          const detector = new window.BarcodeDetector({
            formats: [
              "ean_13",
              "ean_8",
              "upc_a",
              "upc_e",
              "code_128",
              "code_39",
              "qr_code",
            ],
          });
          const tick = async () => {
            if (cancelled || lockedRef.current || !videoRef.current) return;
            try {
              if (videoRef.current.readyState >= 2) {
                const codes = await detector.detect(videoRef.current);
                const raw = codes[0]?.rawValue?.trim();
                if (raw) {
                  lockedRef.current = true;
                  onDetected(raw);
                  onClose();
                  return;
                }
              }
            } catch {
              /* frame skip */
            }
            rafRef.current = requestAnimationFrame(() => {
              void tick();
            });
          };
          rafRef.current = requestAnimationFrame(() => {
            void tick();
          });
          return;
        }

        setHint("Scan ZXing — cadrez le code");
        const reader = new BrowserMultiFormatReader();
        const deviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        const controls = await reader.decodeFromVideoDevice(
          deviceId || undefined,
          video,
          (result, err) => {
            if (cancelled || lockedRef.current) return;
            if (result) {
              const text = result.getText()?.trim();
              if (text) {
                lockedRef.current = true;
                onDetected(text);
                onClose();
              }
              return;
            }
            if (err) {
              /* NotFound = cadre vide, on continue */
            }
          }
        );
        controlsRef.current = controls;
      } catch (e) {
        const msg =
          e instanceof Error && /NotAllowed|Permission/i.test(e.message)
            ? "Autorisez l’accès à la caméra pour scanner."
            : e instanceof Error
              ? e.message
              : "Impossible d’ouvrir la caméra";
        setError(msg);
      }
    }

    void start();

    const videoEl = videoRef.current;
    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      try {
        controlsRef.current?.stop();
      } catch {
        /* ignore */
      }
      controlsRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoEl) videoEl.srcObject = null;
    };
  }, [open, onClose, onDetected]);

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

      <div className="relative min-h-0 flex-1">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-[78%] max-w-sm rounded-2xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      </div>

      {error && (
        <div className="bg-red-600 px-4 py-3 text-sm text-white">{error}</div>
      )}
      {!error && (
        <p className="bg-black px-4 py-3 text-center text-xs text-white/70">
          Placez le code dans le cadre. La détection est automatique.
        </p>
      )}
    </div>
  );
}
