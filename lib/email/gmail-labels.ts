/**
 * Libellés Gmail A.V.A. — architecture prête.
 * Sans GOOGLE_GMAIL_CLIENT_* / refresh token : ne simule pas le classement.
 */

export const GMAIL_LABELS = {
  ORDER_FORM: "Bon de commande",
  PREP_SLIP: "Bon de préparation",
  INVOICE: "Factures",
  MANAGEMENT_REPORTS: "Rapports de gestion",
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

/**
 * Applique un libellé Gmail au message si l'API est configurée.
 * Sinon : retourne configured=false — l'e-mail peut quand même être envoyé via SMTP.
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

  // TODO: brancher googleapis Gmail users.messages.modify + users.labels.create
  // dès que les OAuth All Vap's (avaallvaps@gmail.com) sont fournis.
  console.warn(
    `[All Vap's] Gmail API configurée mais client HTTP non encore branché — label « ${params.labelName} » en attente.`
  );
  return {
    configured: true,
    applied: false,
    messageId: params.messageId,
    reason: "Gmail OAuth prêt — implémentation API labels à finaliser avec les credentials.",
  };
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
        "Libellés prévus (Bon de commande, Bon de préparation, Factures, Rapports de gestion) — API Gmail non connectée.",
    };
  }
  return {
    configured: true,
    labels,
    message: "Credentials Gmail présents — création des libellés à finaliser via API.",
  };
}
