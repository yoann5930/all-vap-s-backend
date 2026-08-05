"use client";

import { useEffect, useRef, useState } from "react";
import { drawProductCropToCanvas } from "@/components/inventory/visual-product-matcher";
import {
  applyContinuousFocus,
  detectTorchSupport,
  openInventoryCamera,
  setCameraTorch,
} from "@/lib/inventory/camera-torch";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Analyse d’un crop produit (mémoire uniquement — jamais enregistré). */
  onFrame: (canvas: HTMLCanvasElement) => void | Promise<void>;
  /** EAN lu sur l’emballage pendant la reconnaissance visuelle (optionnel). */
  onBarcodeFound?: (code: string) => void | Promise<void>;
  /** Statut affiché (Présentez… / Analyse… / Reconnu / Non reconnu). */
  status?: string | null;
  /** Intervalle entre analyses (ms), borné 250–800. */
  intervalMs?: number;
  /** Met en pause l’analyse (ex. suggestions ouvertes) sans fermer la caméra. */
  paused?: boolean;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: {
      formats?: string[];
    }) => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
    };
  }
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
 * Caméra « Photo » inventaire — reconnaissance visuelle du flux uniquement.
 * Aucune capture, aucun enregistrement, aucun upload.
 * Indépendant du scanner EAN (BarcodeCameraScanner).
 */
export function VisualRecognitionCamera({
  open,
  onClose,
  onFrame,
  onBarcodeFound,
  status = null,
  intervalMs = 450,
  paused = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastAtRef = useRef(0);
  const onFrameRef = useRef(onFrame);
  const onBarcodeFoundRef = useRef(onBarcodeFound);
  const intervalRef = useRef(intervalMs);
  const pausedRef = useRef(paused);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(true);
  const [torchHint, setTorchHint] = useState<string | null>(null);

  onFrameRef.current = onFrame;
  onBarcodeFoundRef.current = onBarcodeFound;
  intervalRef.current = Math.max(250, Math.min(800, intervalMs));
  pausedRef.current = paused;

  useEffect(() => {
    if (!open) return;

    busyRef.current = false;
    lastAtRef.current = 0;
    setError(null);
    setReady(false);
    setTorchOn(false);
    setTorchAvailable(true);
    setTorchHint(null);

    let cancelled = false;

    function stopAll() {
      if (loopRef.current != null) {
        window.clearTimeout(loopRef.current);
        loopRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    }

    async function analyzeOnce() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      if (!drawProductCropToCanvas(video, canvas, 384)) return;

      // Lecture éventuelle d’un EAN visible sur la face (sans scanner EAN dédié)
      if (onBarcodeFoundRef.current && typeof window.BarcodeDetector === "function") {
        try {
          const detector = new window.BarcodeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
          });
          const codes = await detector.detect(canvas);
          const raw = codes[0]?.rawValue?.trim();
          if (raw && raw.length >= 6) {
            await onBarcodeFoundRef.current(raw);
            return;
          }
        } catch {
          /* ignore — continuer matching visuel */
        }
      }

      await onFrameRef.current(canvas);
    }

    function startLoop() {
      const tick = async () => {
        if (cancelled) return;
        const now = Date.now();
        if (
          !pausedRef.current &&
          !busyRef.current &&
          now - lastAtRef.current >= intervalRef.current &&
          videoRef.current &&
          videoRef.current.readyState >= 2
        ) {
          busyRef.current = true;
          lastAtRef.current = now;
          try {
            await analyzeOnce();
          } catch {
            /* frame skip */
          } finally {
            busyRef.current = false;
          }
        }
        if (!cancelled) {
          loopRef.current = window.setTimeout(() => {
            void tick();
          }, 100);
        }
      };
      loopRef.current = window.setTimeout(() => {
        void tick();
      }, 350);
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
        const stream = await openInventoryCamera({ width: 1920, height: 1080 });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        setTorchAvailable(detectTorchSupport(track));
        await applyContinuousFocus(track, false);
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
        try {
          await video.play();
        } catch {
          /* autoplay */
        }
        await waitForVideoFrame(video).catch(() => undefined);
        if (cancelled) return;
        setReady(true);
        startLoop();
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
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) {
      setTorchHint("Caméra non prête — réessayez dans 1 seconde");
      return;
    }
    const next = !torchOn;
    const result = await setCameraTorch(track, next);
    if (result.ok) {
      setTorchOn(result.on);
      setTorchAvailable(true);
      setTorchHint(result.on ? "Flash allumé" : null);
      await applyContinuousFocus(track, result.on);
      return;
    }
    setTorchOn(false);
    if (result.unsupported) setTorchAvailable(false);
    setTorchHint(
      result.message || "Flash non disponible — caméra arrière requise"
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div>
          <p className="text-sm font-semibold">Photo — reconnaissance visuelle</p>
          <p className="text-xs text-white/70">
            {status ||
              (ready
                ? "Présentez la face avant du produit devant la caméra"
                : "Ouverture de la caméra…")}
          </p>
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
          className="h-full w-full object-cover bg-black"
          playsInline
          muted
          autoPlay
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-56 w-[78%] max-w-sm rounded-2xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      </div>

      <div className="space-y-2 bg-black px-4 py-3">
        <p className="text-center text-sm font-medium text-white">
          {status || "Présentez la face avant du produit devant la caméra"}
        </p>
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
            Fermer
          </button>
        </div>
        {torchHint ? (
          <p className="text-center text-xs text-amber-200">{torchHint}</p>
        ) : null}
        <p className="pb-2 text-center text-xs text-white/70">
          Aucune photo prise ni enregistrée — analyse du flux en mémoire uniquement.
        </p>
      </div>

      {error ? (
        <div className="bg-red-600 px-4 py-3 text-sm text-white">{error}</div>
      ) : null}
    </div>
  );
}
