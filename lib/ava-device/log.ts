import { sanitizeAvaLogText } from "@/lib/ava/logging";

const SECRETISH =
  /(password|passwd|secret|token|api[_-]?key|authorization|bearer\s+\S+|pin\b|biometric|sms.?code)/i;

export function avaDeviceLog(
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
  console.info(
    `[AVA_DEVICE] ${new Date().toISOString()} ${sanitizeAvaLogText(message, 220)}${bits ? ` ${bits}` : ""}`,
  );
}
