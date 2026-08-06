import { z } from "zod";
import { requireAuth } from "@/lib/jwt";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  sendAdminTestEmail,
  verifyEmailTransport,
  getEmailConfig,
  assertSafeEmailAddress,
} from "@/lib/email";

/**
 * GET — statut du transport (sans secret).
 * POST — envoi d'un e-mail de test (ADMIN uniquement).
 */
export async function GET() {
  try {
    await requireAuth("ADMIN");
    const status = await verifyEmailTransport();
    const cfg = getEmailConfig();
    return jsonResponse({
      ok: status.ok,
      message: status.message,
      mode: status.mode,
      testMode: cfg.testMode,
      fromName: cfg.fromName,
      fromAddress: cfg.fromAddress,
      // jamais de mot de passe / jamais SMTP_APP_PASSWORD
      smtpConfigured: cfg.smtp.hasPassword && !!cfg.smtp.host,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const postSchema = z.object({
  to: z.string().email().max(254).optional(),
});

export async function POST(request: Request) {
  try {
    await requireAuth("ADMIN");
    const ip = clientIp(request);
    const limit = checkRateLimit(`admin-email-test:${ip}`, 5, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop de tentatives. Réessayez plus tard.", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    const body = postSchema.parse(await request.json().catch(() => ({})));
    const cfg = getEmailConfig();
    const to = assertSafeEmailAddress(
      body.to || cfg.testRecipient || cfg.adminNotificationEmail || cfg.fromAddress
    );

    const result = await sendAdminTestEmail({ to });
    return jsonResponse({
      success: true,
      transport: result.transport,
      redirectedToTest: result.redirectedToTest === true,
      // destinataire masqué côté réponse admin
      toMasked: `${to.slice(0, 1)}***@${to.split("@")[1] || ""}`,
      from: `${cfg.fromName} <${cfg.fromAddress}>`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
