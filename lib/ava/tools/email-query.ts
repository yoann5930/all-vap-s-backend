import { getEmailConfig } from "@/lib/email/config";
import {
  getAvaMailboxAddress,
  isForbiddenAutomaticFrom,
  resolveAvaFromAddress,
} from "@/lib/email/ava-identity";
import { isGmailApiConfigured } from "@/lib/email/gmail-labels";
import { avaLog } from "@/lib/ava/logging";

export async function speakAvaEmailStatus(correlationId: string): Promise<{
  ok: boolean;
  spoken: string;
  configured: boolean;
}> {
  try {
    const cfg = getEmailConfig();
    const from = resolveAvaFromAddress();
    if (isForbiddenAutomaticFrom(from)) {
      avaLog("MAIL", correlationId, "sender_forbidden");
      return {
        ok: false,
        configured: false,
        spoken: "L'expéditeur automatique est bloqué. Je n'envoie pas depuis une adresse personnelle.",
      };
    }
    const inbox = isGmailApiConfigured();
    if (!cfg.configured) {
      return {
        ok: false,
        configured: false,
        spoken: "Ma boîte mail n'est pas configurée pour l'envoi pour le moment.",
      };
    }
    const readBit = inbox
      ? "La lecture de la boîte est configurée."
      : "L'envoi est configuré, la lecture inbox n'est pas branchée.";
    avaLog("MAIL", correlationId, "email_status", { configured: 1, inbox: inbox ? 1 : 0 });
    return {
      ok: true,
      configured: true,
      spoken: `J'utilise ${getAvaMailboxAddress()} comme identité. ${readBit}`,
    };
  } catch (error) {
    avaLog("MAIL", correlationId, "email_status_error", {
      err: error instanceof Error ? error.name : "unknown",
    });
    return {
      ok: false,
      configured: false,
      spoken: "Je n'ai pas pu vérifier ma boîte mail.",
    };
  }
}
