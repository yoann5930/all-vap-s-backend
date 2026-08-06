"use client";

import { useRef, useState } from "react";

type Props = {
  onUploaded?: (meta: {
    name: string;
    type: string;
    size: number;
    consent: true;
    mediaId?: string;
  }) => void;
  maxImages?: number;
  maxVideoSeconds?: number;
};

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm";
const FORBIDDEN = /\.(pdf|doc|docx|xls|xlsx|zip|rar|exe|js|ts|bat|cmd|sh)$/i;

export function MediaUploader({
  onUploaded,
  maxImages = 10,
  maxVideoSeconds = 90,
}: Props) {
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [count, setCount] = useState(0);

  async function handleFile(file: File | null) {
    setError(null);
    setProgress(null);
    if (!file) return;
    if (!consent) {
      setError("Merci d'accepter l'analyse du fichier avant l'envoi.");
      return;
    }
    if (FORBIDDEN.test(file.name) || file.type === "application/pdf") {
      setError("Format interdit (PDF / documents / archives). Photo ou vidéo uniquement.");
      return;
    }
    if (file.type.startsWith("image/") && count >= maxImages) {
      setError(`Maximum ${maxImages} images.`);
      return;
    }
    if (file.type.startsWith("video/") && file.size > 80 * 1024 * 1024) {
      setError(`Vidéo trop lourde (max ~${maxVideoSeconds}s compressée).`);
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("consent", "true");

    try {
      setProgress(30);
      const res = await fetch("/api/ava/media", { method: "POST", body: form });
      setProgress(80);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Envoi impossible.");
        setProgress(null);
        return;
      }
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(file));
      setCount((c) => c + 1);
      setProgress(100);
      onUploaded?.({
        name: file.name,
        type: file.type,
        size: file.size,
        consent: true,
        mediaId: data.id || data.mediaId,
      });
    } catch {
      setError("Envoi impossible pour le moment.");
      setProgress(null);
    }
  }

  function clearPreview() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setProgress(null);
  }

  return (
    <div className="mx-4 w-full max-w-md rounded-xl border border-cyan-500/20 bg-black/70 p-3">
      <p className="text-sm font-medium text-cyan-50">Montrez le problème à A.V.A.</p>
      <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-cyan-100/85">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          J&apos;accepte que ce fichier soit analysé pour diagnostiquer mon matériel. Pas de
          publicité. Suppression selon la durée configurée.
        </span>
      </label>

      <input
        ref={photoRef}
        type="file"
        accept={IMAGE_ACCEPT}
        capture="environment"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={videoRef}
        type="file"
        accept={VIDEO_ACCEPT}
        capture="environment"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={!consent}
          onClick={() => photoRef.current?.click()}
          className="min-h-10 rounded-lg border border-cyan-400/35 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40"
        >
          Ajouter une photo
        </button>
        <button
          type="button"
          disabled={!consent}
          onClick={() => videoRef.current?.click()}
          className="min-h-10 rounded-lg border border-cyan-400/35 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40"
        >
          Ajouter une vidéo
        </button>
      </div>

      {progress != null ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-cyan-950">
          <div
            className="h-full bg-cyan-400 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      {preview ? (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Aperçu média"
            className="max-h-40 w-full rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={clearPreview}
            className="mt-1 text-[11px] text-cyan-300/80 underline"
          >
            Supprimer / remplacer
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
