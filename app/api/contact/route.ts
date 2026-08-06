import { z } from "zod";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { assertSameOrigin } from "@/lib/security";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  assertSafeEmailAddress,
  sendContactAdminEmail,
  sendContactConfirmationEmail,
} from "@/lib/email";

const schema = z.object({
  email: z.string().email().max(254),
  name: z.string().max(120).optional(),
  message: z.string().min(10).max(4000),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ip = clientIp(request);
    const limit = checkRateLimit(`contact:ip:${ip}`, 5, 15 * 60 * 1000);
    if (!limit.ok) {
      return jsonResponse(
        { error: "Trop de messages. Réessayez plus tard.", retryAfterSec: limit.retryAfterSec },
        429
      );
    }

    const body = schema.parse(await request.json());
    const email = assertSafeEmailAddress(body.email);
    const emailLimit = checkRateLimit(`contact:email:${email}`, 3, 60 * 60 * 1000);
    if (!emailLimit.ok) {
      return jsonResponse(
        { error: "Trop de messages. Réessayez plus tard.", retryAfterSec: emailLimit.retryAfterSec },
        429
      );
    }

    const requestId = `MSG-${Date.now().toString(36).toUpperCase()}`;

    try {
      await sendContactConfirmationEmail({
        to: email,
        firstName: body.name || null,
        requestId,
      });
    } catch {
      console.error("[contact] confirmation email failed");
    }

    try {
      await sendContactAdminEmail({
        requestId,
        fromEmail: email,
        fromName: body.name || null,
        message: body.message,
      });
    } catch {
      console.error("[contact] admin email failed");
    }

    return jsonResponse({
      success: true,
      requestId,
      message: "Votre message a bien été enregistré. Un e-mail de confirmation vous a été envoyé.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
