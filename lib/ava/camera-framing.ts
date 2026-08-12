export type AvaScreenProfile =
  | "phone-portrait"
  | "phone-landscape"
  | "tablet-portrait"
  | "desktop"
  | "ultrawide";

export interface AvaCameraFraming {
  profile: AvaScreenProfile;
  fov: number;
  cameraY: number;
  cameraZ: number;
  targetY: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Cadrage continu fondé sur la taille réelle du canevas 3D. */
export function getAvaCameraFraming(width: number, height: number): AvaCameraFraming {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const aspect = safeWidth / safeHeight;

  const portrait = clamp01((0.9 - aspect) / 0.45);
  const narrow = clamp01((720 - safeWidth) / 360);
  const short = clamp01((720 - safeHeight) / 360);
  const ultrawide = clamp01((aspect - 1.7) / 0.8);
  const compactPortrait = Math.max(portrait, narrow * 0.9);

  const profile: AvaScreenProfile =
    safeWidth < 640 && aspect < 1
      ? "phone-portrait"
      : safeHeight < 540 && aspect >= 1
        ? "phone-landscape"
        : aspect < 0.9
          ? "tablet-portrait"
          : aspect > 2
            ? "ultrawide"
            : "desktop";

  return {
    profile,
    fov: 48 + compactPortrait * 17 + short * 9 + ultrawide * 3,
    cameraY: 0.015 + compactPortrait * (1 - short) * 0.02,
    cameraZ: 1.82 + short * 0.18 + ultrawide * 0.05,
    targetY: compactPortrait * 0.015,
  };
}
