/**
 * Affichage robuste des logos fabricants (ratio, padding, variante fond).
 */
import type { CSSProperties } from "react";

export type LogoAspectKind = "horizontal" | "square" | "vertical" | "thin" | "sparse";

export type LogoDisplayHints = {
  objectFit: "contain";
  objectPosition: "center";
  /** Multiplicateur de taille visuelle (1 = défaut) */
  scale: number;
  /** Padding interne en px (référence case ~280×175) */
  padding: number;
  background: "transparent" | "neutral" | "dark" | "light";
  variant: "light" | "dark" | "auto";
  aspect: LogoAspectKind;
};

export const DEFAULT_LOGO_DISPLAY: LogoDisplayHints = {
  objectFit: "contain",
  objectPosition: "center",
  scale: 1,
  padding: 20,
  background: "transparent",
  variant: "auto",
  aspect: "horizontal",
};

/** Overrides manuels par slug (après audit visuel). */
export const MANUFACTURER_LOGO_DISPLAY: Record<string, Partial<LogoDisplayHints>> = {
  "vape-47": {
    aspect: "square",
    scale: 1.15,
    padding: 18,
    background: "transparent",
    variant: "auto",
  },
  "e-tasty": {
    aspect: "horizontal",
    scale: 1.05,
    padding: 22,
  },
  "liquide-lab": {
    aspect: "horizontal",
    scale: 0.95,
    padding: 16,
  },
  liquidarom: {
    aspect: "horizontal",
    scale: 1,
    padding: 18,
  },
  liquideo: {
    aspect: "horizontal",
    scale: 1.1,
    padding: 20,
  },
  "biarritz-lab": {
    aspect: "horizontal",
    scale: 1,
    padding: 20,
  },
  airmust: {
    aspect: "horizontal",
    scale: 1.2,
    padding: 24,
    background: "neutral",
  },
  protect: {
    aspect: "horizontal",
    scale: 1.15,
    padding: 22,
  },
  "t-juice": {
    aspect: "square",
    scale: 1.1,
    padding: 20,
  },
  "the-fuu": {
    aspect: "horizontal",
    scale: 1.05,
    padding: 20,
  },
  "cookin-cloud": {
    aspect: "horizontal",
    scale: 1.1,
    padding: 20,
  },
  "eliquid-france": {
    aspect: "horizontal",
    scale: 1.05,
    padding: 20,
  },
  "raneki-liquide": {
    aspect: "horizontal",
    scale: 1.1,
    padding: 22,
  },
};

export function resolveLogoDisplay(slug: string | null | undefined): LogoDisplayHints {
  const override = slug ? MANUFACTURER_LOGO_DISPLAY[slug] : undefined;
  return { ...DEFAULT_LOGO_DISPLAY, ...override, objectFit: "contain", objectPosition: "center" };
}

/** Classes Tailwind pour la case logo (fond carte sombre catalogue). */
export function logoFrameClassName(hints: LogoDisplayHints): string {
  const bg =
    hints.background === "neutral"
      ? "bg-white/5"
      : hints.background === "light"
        ? "bg-white/90"
        : hints.background === "dark"
          ? "bg-black/40"
          : "bg-transparent";
  return `relative flex h-full w-full items-center justify-center ${bg}`;
}

/** Style inline image selon ratio / scale / padding. */
export function logoImageStyle(hints: LogoDisplayHints): CSSProperties {
  const maxH =
    hints.aspect === "thin"
      ? `${Math.round(52 * hints.scale)}%`
      : hints.aspect === "vertical"
        ? `${Math.round(78 * hints.scale)}%`
        : hints.aspect === "square"
          ? `${Math.round(72 * hints.scale)}%`
          : hints.aspect === "sparse"
            ? `${Math.round(85 * hints.scale)}%`
            : `${Math.round(58 * hints.scale)}%`;

  const maxW =
    hints.aspect === "vertical"
      ? `${Math.round(48 * hints.scale)}%`
      : hints.aspect === "thin"
        ? `${Math.round(88 * hints.scale)}%`
        : `${Math.round(82 * hints.scale)}%`;

  return {
    objectFit: "contain",
    objectPosition: "center",
    maxHeight: maxH,
    maxWidth: maxW,
    width: "auto",
    height: "auto",
    padding: hints.padding,
  };
}
