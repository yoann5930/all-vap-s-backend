/**
 * Logs dédiés [AVA_TEST] — jamais de token, mot de passe, PII réelle.
 */
import { sanitizeAvaLogText } from "@/lib/ava/logging";

const SECRETISH =
  /(password|passwd|secret|token|api[_-]?key|authorization|bearer\s+\S+|email\s*[:=])/i;

export function avaTestLog(
  message: string,
  extra?: Record<string, string | number | boolean | null | undefined>,
) {
  const bits = extra
    ? Object.entries(extra)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => {
          const raw = String(v);
          const safe = SECRETISH.test(k) || SECRETISH.test(raw) ? "[redacted]" : raw;
          return `${k}=${safe}`;
        })
        .join(" ")
    : "";
  const ts = new Date().toISOString();
  console.info(
    `[AVA_TEST] ${ts} ${sanitizeAvaLogText(message, 220)}${bits ? ` ${bits}` : ""}`,
  );
}
