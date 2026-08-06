/**
 * Stockage éphémère du QR collaboratrice A.V.A.
 * Jamais persisté en base, jamais loggé, TTL court.
 */

type QrEntry = {
  imageBase64: string;
  mime: string;
  expiresAt: number;
  actionId: string;
};

const globalStore = globalThis as typeof globalThis & {
  __fidelatooQrStore?: Map<string, QrEntry>;
};

function store(): Map<string, QrEntry> {
  if (!globalStore.__fidelatooQrStore) {
    globalStore.__fidelatooQrStore = new Map();
  }
  return globalStore.__fidelatooQrStore;
}

const KEY = "ava-collaborator-qr";

export function setEphemeralQr(input: {
  imageBase64: string;
  mime?: string;
  ttlSec: number;
  actionId: string;
}): { expiresAt: string } {
  const expiresAt = Date.now() + input.ttlSec * 1000;
  store().set(KEY, {
    imageBase64: input.imageBase64,
    mime: input.mime || "image/png",
    expiresAt,
    actionId: input.actionId,
  });
  return { expiresAt: new Date(expiresAt).toISOString() };
}

export function getEphemeralQr(): {
  imageBase64: string;
  mime: string;
  expiresAt: string;
  actionId: string;
} | null {
  const entry = store().get(KEY);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    store().delete(KEY);
    return null;
  }
  return {
    imageBase64: entry.imageBase64,
    mime: entry.mime,
    expiresAt: new Date(entry.expiresAt).toISOString(),
    actionId: entry.actionId,
  };
}

export function clearEphemeralQr(): void {
  store().delete(KEY);
}

export function qrAvailability(): { available: boolean; expiresAt: string | null } {
  const q = getEphemeralQr();
  return { available: !!q, expiresAt: q?.expiresAt ?? null };
}
