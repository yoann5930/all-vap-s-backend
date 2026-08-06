import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { sendContactAdminEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEmailConfig } from "@/lib/email/config";

const schema = z.object({
  email: z.string().email().max(254),
});

/**
 * Inscription newsletter réelle :
 * - notifie l'admin par e-mail
 * - pas de faux succès si SMTP/Resend absent
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limited = checkRateLimit(`newsletter:${ip}`, 5, 60_000);
    if (!limited.ok) {
      return jsonResponse({ error: "Trop de tentatives. Réessayez plus tard." }, 429);
    }

    const body = schema.parse(await request.json());
    const email = body.email.toLowerCase();
    const cfg = getEmailConfig();

    if (!cfg.smtp.hasPassword && !cfg.resendConfigured) {
      return jsonResponse(
        {
          error:
            "Inscription newsletter indisponible : service e-mail non configuré (SMTP ou Resend).",
        },
        503
      );
    }

    if (!cfg.adminNotificationEmail && !cfg.fromAddress) {
      return jsonResponse(
        {
          error:
            "Inscription newsletter indisponible : ADMIN_NOTIFICATION_EMAIL manquant.",
        },
        503
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, firstName: true },
    });

    const requestId = `NL-${Date.now().toString(36).toUpperCase()}`;
    await sendContactAdminEmail({
      requestId,
      fromEmail: email,
      fromName: existing?.firstName || "Newsletter",
      message: existing
        ? `Demande d'inscription newsletter (compte existant id=${existing.id}).`
        : "Demande d'inscription newsletter (visiteur).",
    });

    return jsonResponse({
      ok: true,
      message: "Merci. Votre demande d'inscription a été transmise à All Vap's.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
