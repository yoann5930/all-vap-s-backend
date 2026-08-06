"use client";

type Candidate = {
  manufacturer: string;
  model: string;
  modelSlug: string;
  imageUrl: string | null;
  distinguishingFeatures: string[];
};

type Props = {
  candidates: Candidate[];
  onConfirm: (c: Candidate) => void;
  onReject: () => void;
  onUnsure: () => void;
  onAddPhoto: () => void;
};

export function DeviceIdentification({
  candidates,
  onConfirm,
  onReject,
  onUnsure,
  onAddPhoto,
}: Props) {
  if (!candidates.length) return null;

  return (
    <div
      className="mx-4 w-full max-w-md space-y-2"
      role="group"
      aria-label="Confirmation du modèle"
    >
      <p className="text-center text-xs text-cyan-200/80">Est-ce bien ce modèle ?</p>
      {candidates.slice(0, 3).map((c) => (
        <button
          key={c.modelSlug}
          type="button"
          onClick={() => onConfirm(c)}
          className="flex w-full items-center gap-3 rounded-xl border border-cyan-500/25 bg-black/75 p-2 text-left"
        >
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cyan-950/40">
            {c.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.imageUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[9px] text-cyan-700/50">Photo officielle à venir</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-cyan-50">
              {c.manufacturer} {c.model}
            </p>
            {c.distinguishingFeatures[0] ? (
              <p className="text-[10px] text-cyan-500/60">{c.distinguishingFeatures[0]}</p>
            ) : null}
          </div>
        </button>
      ))}
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <button
          type="button"
          className="min-h-10 rounded-lg border border-cyan-400/40 px-3 text-xs text-cyan-100"
          onClick={() => onConfirm(candidates[0])}
        >
          Oui, c&apos;est bien celui-ci
        </button>
        <button
          type="button"
          className="min-h-10 rounded-lg border border-cyan-800/40 px-3 text-xs text-cyan-400/70"
          onClick={onReject}
        >
          Non, ce n&apos;est pas celui-ci
        </button>
        <button
          type="button"
          className="min-h-10 rounded-lg border border-cyan-800/40 px-3 text-xs text-cyan-400/70"
          onClick={onUnsure}
        >
          Je ne suis pas sûr
        </button>
        <button
          type="button"
          className="min-h-10 rounded-lg border border-cyan-800/40 px-3 text-xs text-cyan-400/70"
          onClick={onAddPhoto}
        >
          Ajouter une photo de mon matériel
        </button>
      </div>
    </div>
  );
}
