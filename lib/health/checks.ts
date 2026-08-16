/**
 * Contrôles santé — timeouts stricts, pas d'appels externes bloquants.
 */
import { isDemoMode } from "@/lib/demo";

export const DB_CHECK_MS = 800;
export const OPTIONAL_CHECK_MS = 500;

export type CheckStatus = "ok" | "error" | "skipped" | "not_configured";

export type NamedCheck = {
  status: CheckStatus;
  detail?: string;
  ms?: number;
};

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}_timeout_${ms}ms`)),
          ms
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Liveness : le process Node répond (aucun I/O). */
export function checkApplication(): NamedCheck {
  return { status: "ok", ms: 0 };
}

/**
 * Readiness DB — SELECT 1 avec timeout strict.
 * Ne crée pas de nouveau client Prisma (réutilise le singleton).
 */
export async function checkDatabase(
  opts?: { query?: () => Promise<unknown>; timeoutMs?: number }
): Promise<NamedCheck> {
  const timeoutMs = opts?.timeoutMs ?? DB_CHECK_MS;
  const started = Date.now();

  if (isDemoMode()) {
    return {
      status: "ok",
      detail: "demo_mode",
      ms: Date.now() - started,
    };
  }

  try {
    const run =
      opts?.query ??
      (async () => {
        const { default: prisma } = await import("@/lib/prisma");
        return prisma.$queryRaw`SELECT 1`;
      });
    await withTimeout(run(), timeoutMs, "database");
    return { status: "ok", ms: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "error",
      detail: message,
      ms: Date.now() - started,
    };
  }
}

/** Diagnostics optionnels — env uniquement, jamais d'appel réseau. */
export function checkOptionalEnvServices(): Record<string, NamedCheck> {
  const emailEnabled = process.env.MAIL_ENABLED !== "false";
  const hasSmtp =
    !!process.env.SMTP_PASS ||
    !!process.env.SMTP_PASSWORD ||
    !!process.env.SMTP_APP_PASSWORD;
  const hasResend = !!process.env.RESEND_API_KEY;
  const emailOk = emailEnabled && (hasSmtp || hasResend);

  const sumup =
    !!process.env.SUMUP_API_KEY && !!process.env.SUMUP_MERCHANT_CODE;
  const viva =
    !!process.env.VIVA_MERCHANT_ID &&
    !!process.env.VIVA_API_KEY &&
    !!process.env.VIVA_CLIENT_ID;

  return {
    email: emailOk
      ? { status: "ok", detail: hasSmtp ? "smtp_env" : "resend_env" }
      : {
          status: "not_configured",
          detail: emailEnabled ? "missing_credentials" : "MAIL_ENABLED=false",
        },
    payment: sumup || viva
      ? { status: "ok", detail: viva ? "viva_env" : "sumup_env" }
      : { status: "not_configured" },
    push:
      process.env.PUSH_ENABLED === "true" && !!process.env.PUSH_PROJECT_ID
        ? { status: "ok", detail: "push_env" }
        : { status: "not_configured" },
    cron: process.env.CRON_SECRET
      ? { status: "ok", detail: "cron_secret_set" }
      : { status: "not_configured" },
  };
}

/**
 * Audit mode — lecture seule, timeout ; jamais de deactivate (écritures) sur le chemin health.
 */
export async function checkAuditModePublic(
  timeoutMs = OPTIONAL_CHECK_MS
): Promise<NamedCheck & { enabled?: boolean; campaignId?: string | null }> {
  const started = Date.now();
  try {
    const { default: prisma } = await import("@/lib/prisma");
    const row = await withTimeout(
      prisma.appSetting.findUnique({ where: { key: "ava.audit_mode" } }),
      timeoutMs,
      "audit_mode"
    );
    const v =
      row?.valueJson && typeof row.valueJson === "object"
        ? (row.valueJson as { enabled?: boolean; campaignId?: string | null })
        : null;
    return {
      status: "ok",
      enabled: !!v?.enabled,
      campaignId: v?.campaignId ?? null,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
      ms: Date.now() - started,
    };
  }
}

export function overallStatus(
  application: NamedCheck,
  database: NamedCheck
): "ok" | "degraded" | "error" {
  if (application.status !== "ok") return "error";
  if (database.status === "error") return "error";
  if (database.status !== "ok") return "degraded";
  return "ok";
}
