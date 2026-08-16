/**
 * Lecture de la boîte AVA (Gmail API si configurée).
 * Distingue les e-mails réels des messages qu'AVA vient d'envoyer.
 * Ne déclenche aucun workflow interne « commande prête ».
 */
import { google } from "googleapis";
import { isGmailApiConfigured } from "@/lib/email/gmail-labels";
import {
  classifyIncomingMail,
  type IncomingMailDecision,
  type IncomingMailMessage,
} from "@/lib/email/incoming-classify";
import { getAvaMailboxAddress } from "@/lib/email/ava-identity";
import { isImapConfigured, probeAvaImapInbox } from "@/lib/email/imap-probe";

export type ReadAvaMailboxResult = {
  configured: boolean;
  mailbox: string;
  scanned: number;
  actionable: Array<{
    id: string;
    from: string;
    subject: string;
    kind: IncomingMailDecision["kind"];
    reason: string;
  }>;
  skippedSelf: number;
};

function gmailClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_GMAIL_CLIENT_ID,
    process.env.GOOGLE_GMAIL_CLIENT_SECRET,
  );
  client.setCredentials({
    refresh_token: process.env.GOOGLE_GMAIL_REFRESH_TOKEN,
  });
  return google.gmail({ version: "v1", auth: client });
}

function headerValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string {
  const found = (headers || []).find(
    (h) => (h.name || "").toLowerCase() === name.toLowerCase(),
  );
  return (found?.value || "").trim();
}

export async function readAvaIncomingMailbox(limit = 20): Promise<ReadAvaMailboxResult> {
  const mailbox = getAvaMailboxAddress();
  if (!isGmailApiConfigured()) {
    if (isImapConfigured()) {
      const probe = await probeAvaImapInbox();
      return {
        configured: probe.ok,
        mailbox,
        scanned: probe.exists ?? 0,
        actionable: [],
        skippedSelf: 0,
      };
    }
    return {
      configured: false,
      mailbox,
      scanned: 0,
      actionable: [],
      skippedSelf: 0,
    };
  }

  const gmail = gmailClient();
  const listed = await gmail.users.messages.list({
    userId: "me",
    maxResults: Math.min(50, Math.max(1, limit)),
    q: "in:inbox",
  });
  const ids = (listed.data.messages || []).map((m) => m.id).filter(Boolean) as string[];
  let skippedSelf = 0;
  const actionable: ReadAvaMailboxResult["actionable"] = [];

  for (const id of ids) {
    const full = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Message-ID", "Auto-Submitted"],
    });
    const headers = full.data.payload?.headers || [];
    const msg: IncomingMailMessage = {
      from: headerValue(headers, "From"),
      to: headerValue(headers, "To"),
      subject: headerValue(headers, "Subject"),
      messageId: headerValue(headers, "Message-ID") || full.data.id,
      threadId: full.data.threadId,
      direction: "inbound",
      headers: {
        "auto-submitted": headerValue(headers, "Auto-Submitted"),
      },
    };
    const decision = classifyIncomingMail(msg);
    if (decision.skipBusiness) {
      skippedSelf += 1;
      continue;
    }
    actionable.push({
      id,
      from: msg.from || "",
      subject: msg.subject || "",
      kind: decision.kind,
      reason: decision.reason,
    });
  }

  return {
    configured: true,
    mailbox,
    scanned: ids.length,
    actionable,
    skippedSelf,
  };
}
