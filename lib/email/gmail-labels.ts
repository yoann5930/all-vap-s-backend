/**
 * Libellés Gmail A.V.A.
 * Sans OAuth Gmail : ne simule pas le classement.
 */
import { google } from "googleapis";

export const GMAIL_LABELS = {
  ORDER_FORM: "All Vap's/Commandes",
  PREP_SLIP: "All Vap's/Préparation",
  INVOICE: "All Vap's/Commandes",
  MANAGEMENT_REPORTS: "All Vap's/Rapports",
  SHIP_MR: "All Vap's/Expéditions/Mondial Relay",
  SHIP_RC: "All Vap's/Expéditions/Relais Colis",
  SHIP_CHRONO: "All Vap's/Expéditions/Chronopost",
  SHIP_PICKUP: "All Vap's/Expéditions/Retrait magasin",
} as const;

export type GmailLabelResult = {
  configured: boolean;
  applied: boolean;
  messageId?: string | null;
  reason?: string;
};

export function isGmailApiConfigured(): boolean {
  return !!(
    process.env.GOOGLE_GMAIL_CLIENT_ID &&
    process.env.GOOGLE_GMAIL_CLIENT_SECRET &&
    process.env.GOOGLE_GMAIL_REFRESH_TOKEN
  );
}

function gmailOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_GMAIL_CLIENT_ID,
    process.env.GOOGLE_GMAIL_CLIENT_SECRET,
  );
  client.setCredentials({
    refresh_token: process.env.GOOGLE_GMAIL_REFRESH_TOKEN,
  });
  return google.gmail({ version: "v1", auth: client });
}

const labelIdCache = new Map<string, string>();

async function ensureLabelId(
  gmail: ReturnType<typeof gmailOAuthClient>,
  labelName: string,
): Promise<string> {
  const cached = labelIdCache.get(labelName);
  if (cached) return cached;
  const listed = await gmail.users.labels.list({ userId: "me" });
  const existing = (listed.data.labels || []).find((l) => l.name === labelName);
  if (existing?.id) {
    labelIdCache.set(labelName, existing.id);
    return existing.id;
  }
  const created = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  const id = created.data.id;
  if (!id) throw new Error("GMAIL_LABEL_CREATE_FAILED");
  labelIdCache.set(labelName, id);
  return id;
}

/**
 * Applique un libellé Gmail au message si l'API est configurée.
 * Sinon : configured=false — l'e-mail peut quand même partir via SMTP.
 */
export async function applyGmailLabelIfConfigured(params: {
  labelName: string;
  messageId?: string | null;
}): Promise<GmailLabelResult> {
  if (!isGmailApiConfigured()) {
    return {
      configured: false,
      applied: false,
      reason:
        "API Gmail non configurée (GOOGLE_GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN). Classement automatique en attente.",
    };
  }

  if (!params.messageId) {
    return {
      configured: true,
      applied: false,
      reason: "Pas de messageId SMTP à classer.",
    };
  }

  try {
    const gmail = gmailOAuthClient();
    const labelId = await ensureLabelId(gmail, params.labelName);
    await gmail.users.messages.modify({
      userId: "me",
      id: params.messageId,
      requestBody: { addLabelIds: [labelId] },
    });
    return {
      configured: true,
      applied: true,
      messageId: params.messageId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "gmail_label_failed";
    console.warn("[gmail] label not applied:", message);
    return {
      configured: true,
      applied: false,
      messageId: params.messageId,
      reason: message,
    };
  }
}

/**
 * Crée les libellés Gmail requis s'ils n'existent pas.
 */
export async function ensureAvaGmailLabels(): Promise<{
  configured: boolean;
  labels: string[];
  message: string;
}> {
  const labels = Object.values(GMAIL_LABELS);
  if (!isGmailApiConfigured()) {
    return {
      configured: false,
      labels,
      message:
        "Libellés prévus (Commandes, Préparation, Expéditions) — API Gmail non connectée.",
    };
  }
  try {
    const gmail = gmailOAuthClient();
    for (const name of labels) {
      await ensureLabelId(gmail, name);
    }
    return {
      configured: true,
      labels,
      message: "Libellés Gmail All Vap's créés ou déjà présents.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "gmail_labels_failed";
    return {
      configured: true,
      labels,
      message: `Credentials Gmail présents — création libellés en échec : ${message}`,
    };
  }
}
