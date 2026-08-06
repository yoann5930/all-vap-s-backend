"use client";

type Props = {
  /** Paroles AVA */
  assistantText: string;
  /** Transcription client (interim ou finale) */
  userText?: string;
  largeText?: boolean;
  highContrast?: boolean;
  className?: string;
};

/** Sous-titres permanents synchronisés avec la conversation. */
export function LiveSubtitles({
  assistantText,
  userText,
  largeText = false,
  highContrast = false,
  className = "",
}: Props) {
  if (!assistantText && !userText) return null;

  return (
    <div
      className={`w-full max-w-lg space-y-2 px-4 ${className}`}
      aria-live="polite"
    >
      {assistantText ? (
        <p
          className={`text-center leading-relaxed ${
            largeText ? "text-base sm:text-lg" : "text-sm sm:text-base"
          } ${
            highContrast
              ? "text-white"
              : "text-cyan-50/90"
          }`}
        >
          {assistantText}
        </p>
      ) : null}
      {userText ? (
        <p
          className={`text-center ${
            largeText ? "text-sm" : "text-xs"
          } ${highContrast ? "text-cyan-100" : "text-cyan-400/55"}`}
          aria-label={`Vous avez dit : ${userText}`}
        >
          Vous : {userText}
        </p>
      ) : null}
    </div>
  );
}
