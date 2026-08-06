/**
 * Analytics vidéo légères (mémoire process — évolutif vers DB plus tard).
 */
type Event = {
  at: string;
  type: string;
  videoId?: string;
  meta?: Record<string, unknown>;
};

const buffer: Event[] = [];

export function trackVideoEvent(type: string, videoId?: string, meta?: Record<string, unknown>) {
  buffer.push({ at: new Date().toISOString(), type, videoId, meta });
  if (buffer.length > 500) buffer.shift();
}

export function getRecentVideoEvents(limit = 50) {
  return buffer.slice(-limit);
}
