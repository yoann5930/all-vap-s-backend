/**
 * Actions rapides A.V.A. — source de vérité unique (labels + intentions).
 * Ne pas dupliquer les textes dans les composants UI.
 */

export type AvaQuickIntent =
  | "BEGINNER_VAPING"
  | "NICOTINE_GUIDANCE"
  | "FRUIT_FLAVOUR_GUIDANCE"
  | "BEGINNER_DEVICE_GUIDANCE"
  | "OPEN_GENERAL_CHAT";

export type AvaQuickMode = "GUIDANCE" | "PRODUCT_ADVICE" | "GENERAL";

export type AvaQuickFlowId =
  | "BEGINNER_ONBOARDING"
  | "NICOTINE_SELECTION"
  | "FRUIT_FLAVOUR_SELECTION"
  | "BEGINNER_DEVICE_SELECTION"
  | null;

export type AvaQuickActionConfig = {
  label: string;
  initialMessage: string | null;
  mode: AvaQuickMode;
  flow: AvaQuickFlowId;
};

export const AVA_QUICK_ACTIONS: Record<AvaQuickIntent, AvaQuickActionConfig> = {
  BEGINNER_VAPING: {
    label: "Je débute la vape",
    initialMessage: "Je débute la vape et j’ai besoin d’être guidé.",
    mode: "GUIDANCE",
    flow: "BEGINNER_ONBOARDING",
  },
  NICOTINE_GUIDANCE: {
    label: "Quel taux de nicotine choisir ?",
    initialMessage: "Je voudrais savoir quel taux de nicotine choisir.",
    mode: "GUIDANCE",
    flow: "NICOTINE_SELECTION",
  },
  FRUIT_FLAVOUR_GUIDANCE: {
    label: "Quels sont les meilleurs fruits ?",
    initialMessage: "Je recherche un e-liquide fruité et j’aimerais être conseillé.",
    mode: "PRODUCT_ADVICE",
    flow: "FRUIT_FLAVOUR_SELECTION",
  },
  BEGINNER_DEVICE_GUIDANCE: {
    label: "Quel matériel pour commencer ?",
    initialMessage: "Je débute et je cherche un matériel adapté pour commencer.",
    mode: "PRODUCT_ADVICE",
    flow: "BEGINNER_DEVICE_SELECTION",
  },
  OPEN_GENERAL_CHAT: {
    label: "Discuter avec A.V.A.",
    initialMessage: null,
    mode: "GENERAL",
    flow: null,
  },
};

/** Ordre d’affichage des boutons d’accès rapide (hors CTA général). */
export const AVA_QUICK_ACTION_ORDER: AvaQuickIntent[] = [
  "BEGINNER_VAPING",
  "NICOTINE_GUIDANCE",
  "FRUIT_FLAVOUR_GUIDANCE",
  "BEGINNER_DEVICE_GUIDANCE",
];

export const AVA_OPEN_EVENT = "allvaps:open-ava";
export const AVA_PENDING_INTENT_KEY = "allvaps_ava_pending_intent";
export const AVA_INTENT_CONFIRM_KEY = "allvaps_ava_intent_needs_confirm";

export type PendingAvaIntent = {
  id: string;
  intent: AvaQuickIntent;
  createdAt: number;
  /** Empêche une double consommation après remount. */
  consumed: boolean;
};

const OPEN_DEBOUNCE_MS = 700;
let lastOpenAt = 0;
let lastOpenIntent: AvaQuickIntent | null = null;

function newIntentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ava-intent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getQuickAction(intent: AvaQuickIntent): AvaQuickActionConfig {
  return AVA_QUICK_ACTIONS[intent];
}

export function intentFromLabel(label: string): AvaQuickIntent | null {
  const normalized = label.trim().toLowerCase();
  for (const [key, cfg] of Object.entries(AVA_QUICK_ACTIONS) as Array<
    [AvaQuickIntent, AvaQuickActionConfig]
  >) {
    if (cfg.label.toLowerCase() === normalized) return key;
  }
  return null;
}

export function readPendingIntent(): PendingAvaIntent | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(AVA_PENDING_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAvaIntent;
    if (!parsed?.id || !parsed?.intent || parsed.consumed) return null;
    // TTL 5 minutes
    if (Date.now() - parsed.createdAt > 5 * 60 * 1000) {
      window.sessionStorage.removeItem(AVA_PENDING_INTENT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writePendingIntent(pending: PendingAvaIntent): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(AVA_PENDING_INTENT_KEY, JSON.stringify(pending));
  } catch {
    /* ignore quota */
  }
}

export function clearPendingIntent(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(AVA_PENDING_INTENT_KEY);
    window.sessionStorage.removeItem(AVA_INTENT_CONFIRM_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Consomme l’intention une seule fois (id obligatoire).
 * Retourne null si déjà consommée, absente ou id différent.
 */
export function consumePendingIntent(expectedId?: string): PendingAvaIntent | null {
  const pending = readPendingIntent();
  if (!pending) return null;
  if (expectedId && pending.id !== expectedId) return null;
  if (pending.consumed) return null;
  const consumed: PendingAvaIntent = { ...pending, consumed: true };
  writePendingIntent(consumed);
  // Nettoyage différé : laisse un refresh immédiat relire « déjà consommé »
  try {
    window.sessionStorage.setItem(
      AVA_PENDING_INTENT_KEY,
      JSON.stringify({ ...consumed, consumed: true })
    );
  } catch {
    /* ignore */
  }
  return pending;
}

export function markIntentNeedsDiagnosticConfirm(pending: PendingAvaIntent): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(AVA_INTENT_CONFIRM_KEY, JSON.stringify(pending));
  } catch {
    /* ignore */
  }
}

export function readIntentNeedsDiagnosticConfirm(): PendingAvaIntent | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(AVA_INTENT_CONFIRM_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingAvaIntent;
  } catch {
    return null;
  }
}

export function clearIntentNeedsDiagnosticConfirm(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(AVA_INTENT_CONFIRM_KEY);
  } catch {
    /* ignore */
  }
}

function hasActiveDiagnosticInSession(): boolean {
  if (!isBrowser()) return false;
  try {
    const raw = window.sessionStorage.getItem("allvaps_ava_conversation_ctx");
    if (!raw) return false;
    const ctx = JSON.parse(raw) as { diagnosticSession?: { active?: boolean } };
    return Boolean(ctx?.diagnosticSession?.active);
  } catch {
    return false;
  }
}

export type OpenAvaResult =
  | { ok: true; pending: PendingAvaIntent | null; needsConfirm: boolean }
  | { ok: false; reason: "debounced" };

/**
 * Point d’entrée unique : enregistre l’intention (si applicable) et ouvre A.V.A.
 * Ne réinitialise pas un diagnostic ; demande confirmation côté UI si besoin.
 * OPEN_GENERAL_CHAT n’écrase pas une intention non consommée.
 */
export function openAvaWithIntent(intent: AvaQuickIntent): OpenAvaResult {
  if (!isBrowser()) {
    return { ok: false, reason: "debounced" };
  }

  const now = Date.now();
  if (lastOpenIntent === intent && now - lastOpenAt < OPEN_DEBOUNCE_MS) {
    return { ok: false, reason: "debounced" };
  }
  lastOpenAt = now;
  lastOpenIntent = intent;

  const cfg = AVA_QUICK_ACTIONS[intent];

  // Chat général : ouvrir sans inventer de message, sans écraser une intention en attente
  if (intent === "OPEN_GENERAL_CHAT") {
    window.dispatchEvent(
      new CustomEvent(AVA_OPEN_EVENT, {
        detail: { intent, id: null, general: true },
      })
    );
    return { ok: true, pending: null, needsConfirm: false };
  }

  const pending: PendingAvaIntent = {
    id: newIntentId(),
    intent,
    createdAt: now,
    consumed: false,
  };

  const needsConfirm = hasActiveDiagnosticInSession();
  if (needsConfirm) {
    markIntentNeedsDiagnosticConfirm(pending);
    writePendingIntent(pending);
    window.dispatchEvent(
      new CustomEvent(AVA_OPEN_EVENT, {
        detail: { ...pending, needsConfirm: true, label: cfg.label },
      })
    );
    return { ok: true, pending, needsConfirm: true };
  }

  writePendingIntent(pending);
  clearIntentNeedsDiagnosticConfirm();
  window.dispatchEvent(
    new CustomEvent(AVA_OPEN_EVENT, {
      detail: { ...pending, needsConfirm: false, label: cfg.label },
    })
  );
  return { ok: true, pending, needsConfirm: false };
}

/** Confirme le départ du diagnostic pour démarrer le parcours rapide. */
export function confirmReplaceDiagnosticWithIntent(): PendingAvaIntent | null {
  const pending =
    readIntentNeedsDiagnosticConfirm() ?? readPendingIntent();
  if (!pending) return null;
  clearIntentNeedsDiagnosticConfirm();
  // Réactiver comme non consommée pour le consommateur UI
  const fresh: PendingAvaIntent = {
    ...pending,
    consumed: false,
    createdAt: Date.now(),
    id: pending.id || newIntentId(),
  };
  writePendingIntent(fresh);
  return fresh;
}

export function cancelReplaceDiagnosticIntent(): void {
  clearIntentNeedsDiagnosticConfirm();
  clearPendingIntent();
}
