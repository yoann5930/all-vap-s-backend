"use client";

type Props = {
  steps: string[];
  stepIndex: number;
  onNext: () => void;
  officialManualUrl?: string | null;
};

/** Une étape à la fois. */
export function DeviceManualHelp({
  steps,
  stepIndex,
  onNext,
  officialManualUrl,
}: Props) {
  if (!steps.length) return null;
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  return (
    <div className="mx-4 max-w-md rounded-xl border border-cyan-500/20 bg-black/70 p-3 text-center">
      <p className="text-sm text-cyan-50/90">{step}</p>
      <p className="mt-1 text-[10px] text-cyan-600/50">
        Étape {Math.min(stepIndex + 1, steps.length)} / {steps.length}
      </p>
      {stepIndex < steps.length - 1 ? (
        <button
          type="button"
          onClick={onNext}
          className="mt-2 min-h-10 rounded-lg border border-cyan-400/35 px-4 text-xs text-cyan-100"
        >
          Étape suivante
        </button>
      ) : null}
      {officialManualUrl ? (
        <a
          href={officialManualUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-[10px] text-cyan-400/60 underline"
        >
          Notice officielle
        </a>
      ) : null}
    </div>
  );
}
