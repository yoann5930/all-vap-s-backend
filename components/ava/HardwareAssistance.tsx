"use client";

import { Camera, ImagePlus, Video, Film, SkipForward } from "lucide-react";

type PhotoBtn = { id: string; label: string };

type Props = {
  onTakePhoto?: () => void;
  onAddPhoto?: () => void;
  onRecordVideo?: () => void;
  onAddVideo?: () => void;
  onSkip?: () => void;
  onPhotoAction?: (id: string) => void;
  photoButtons?: ReadonlyArray<PhotoBtn>;
  className?: string;
};

export function HardwareAssistance({
  onTakePhoto,
  onAddPhoto,
  onRecordVideo,
  onAddVideo,
  onSkip,
  onPhotoAction,
  photoButtons,
  className = "",
}: Props) {
  const guided = photoButtons && photoButtons.length > 0;

  return (
    <section
      className={`mx-4 w-full max-w-md rounded-xl border border-cyan-500/25 bg-black/80 p-4 text-left ${className}`}
      aria-label="Assistance matériel"
    >
      <h2 className="text-sm font-medium text-cyan-50">Montrez le problème à A.V.A.</h2>
      <p className="mt-1 text-xs leading-relaxed text-cyan-300/70">
        Ajoutez une photo ou une courte vidéo uniquement pour montrer le dysfonctionnement ou
        reconnaître le matériel. Aucune facture, notice ni justificatif n&apos;est demandé.
      </p>
      <p className="mt-2 text-[10px] text-amber-200/70">
        Évitez de montrer votre visage, vos documents personnels ou toute information confidentielle.
      </p>
      {guided ? (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {photoButtons.map((b) => (
            <ActionBtn
              key={b.id}
              icon={b.id === "video" ? Film : ImagePlus}
              label={b.label}
              onClick={() => {
                onPhotoAction?.(b.id);
                if (b.id === "video") onAddVideo?.();
                else onAddPhoto?.();
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ActionBtn icon={Camera} label="Prendre une photo" onClick={onTakePhoto} />
          <ActionBtn icon={ImagePlus} label="Ajouter une photo" onClick={onAddPhoto} />
          <ActionBtn icon={Film} label="Filmer le problème" onClick={onRecordVideo} />
          <ActionBtn icon={Video} label="Ajouter une vidéo" onClick={onAddVideo} />
        </div>
      )}
      <button
        type="button"
        onClick={onSkip}
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-cyan-800/40 px-3 py-2 text-xs text-cyan-400/70"
      >
        <SkipForward className="h-3.5 w-3.5" aria-hidden />
        Continuer sans image
      </button>
    </section>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Camera;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}
