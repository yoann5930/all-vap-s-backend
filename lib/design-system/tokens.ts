/**
 * All Vap's Design System V1.0 — Design Tokens (app copy)
 * Canonical folder: /design-system/tokens
 */

export const colors = {
  deepBlack: "#050505",
  anthracite: "#141414",
  white: "#FFFFFF",
  steel: "#8A8A8E",
  smoke: "#2C2C2E",
  charcoal: "#0C0C0C",
  mist: "#C7C7CC",
  accent: "#3D7EFF",
  accentMuted: "rgba(61, 126, 255, 0.14)",
  accentBorder: "rgba(61, 126, 255, 0.28)",
  accentGlow: "rgba(61, 126, 255, 0.22)",
  success: "#3D9A6A",
  warning: "#C9A227",
  danger: "#C44B4B",
  lightBg: "#FAFAFA",
  lightSurface: "#FFFFFF",
  lightText: "#111111",
  lightMuted: "#6B6B70",
  lightBorder: "#E5E5EA",
} as const;

export const typography = {
  display: {
    family: '"Outfit", ui-sans-serif, system-ui, sans-serif',
    weights: [200, 300, 400, 500, 600],
  },
  body: {
    family: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
    weights: [300, 400, 500, 600],
  },
  scale: {
    hero: "clamp(2.75rem, 6vw, 4.5rem)",
    h1: "clamp(2rem, 4vw, 3rem)",
    h2: "clamp(1.5rem, 3vw, 2rem)",
    h3: "1.25rem",
    body: "1rem",
    small: "0.875rem",
    caption: "0.75rem",
    label: "0.6875rem",
  },
  tracking: {
    hero: "0.08em",
    title: "0.04em",
    label: "0.22em",
    button: "0.06em",
  },
} as const;

export const spacing = {
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
  section: "clamp(4rem, 8vw, 7rem)",
} as const;

export const radii = {
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  pill: "9999px",
} as const;

export const shadows = {
  none: "none",
  soft: "0 8px 32px rgba(0, 0, 0, 0.35)",
  elevated: "0 16px 48px rgba(0, 0, 0, 0.45)",
  accent: "0 0 24px rgba(61, 126, 255, 0.18)",
  accentStrong: "0 0 36px rgba(61, 126, 255, 0.28)",
  inset: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
} as const;

export const motion = {
  duration: {
    fast: "150ms",
    base: "280ms",
    slow: "450ms",
    splash: "800ms",
  },
  easing: {
    standard: "cubic-bezier(0.16, 1, 0.3, 1)",
    soft: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
} as const;

export const themes = {
  dark: {
    bg: colors.deepBlack,
    surface: colors.anthracite,
    text: colors.white,
    muted: colors.steel,
    border: "rgba(255,255,255,0.08)",
    accent: colors.accent,
  },
  light: {
    bg: colors.lightBg,
    surface: colors.lightSurface,
    text: colors.lightText,
    muted: colors.lightMuted,
    border: colors.lightBorder,
    accent: colors.accent,
  },
} as const;

export const brandAssets = {
  logoOfficial: "/brand/logo-official.png",
  logoOg: "/brand/og-image.png",
  favicon: "/favicon-32.png",
  appleTouch: "/apple-touch-icon.png",
  pwa192: "/icon-192.png",
  pwa512: "/icon-512.png",
  splash: "/splash/splash-1080x1920.png",
} as const;

const tokens = {
  colors,
  typography,
  spacing,
  radii,
  shadows,
  motion,
  themes,
  brandAssets,
};

export default tokens;
