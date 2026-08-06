import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const knownErrors: Record<string, { message: string; status: number }> = {
  UNAUTHORIZED: { message: "Non authentifié", status: 401 },
  FORBIDDEN: { message: "Accès refusé", status: 403 },
  EMAIL_EXISTS: { message: "Cet email est déjà utilisé", status: 409 },
  INVALID_CREDENTIALS: { message: "Email ou mot de passe incorrect", status: 401 },
  NOT_FOUND: { message: "Ressource introuvable", status: 404 },
  SUMUP_NOT_CONFIGURED: {
    message: "Le service de paiement est temporairement indisponible. Aucun montant n'a été débité.",
    status: 503,
  },
  VIVA_NOT_CONFIGURED: {
    message: "Le service de paiement est temporairement indisponible. Aucun montant n'a été débité.",
    status: 503,
  },
  PAYMENT_UNAVAILABLE: {
    message: "Le service de paiement est temporairement indisponible. Aucun montant n'a été débité.",
    status: 503,
  },
  EMAIL_NOT_CONFIGURED: { message: "Envoi d'email non configuré", status: 503 },
  EMAIL_DISABLED: { message: "Service e-mail désactivé", status: 503 },
  INVALID_RECIPIENT: { message: "Adresse e-mail invalide", status: 400 },
  HEADER_INJECTION: { message: "Requête invalide", status: 400 },
  SEND_FAILED: { message: "L'e-mail n'a pas pu être envoyé. Réessayez plus tard.", status: 502 },
  TEST_RECIPIENT_REQUIRED: {
    message: "Mode test actif : destinataire de test manquant",
    status: 400,
  },
  INVALID_TOKEN: { message: "Token invalide ou expiré", status: 400 },
  EMAIL_NOT_VERIFIED: {
    message: "Activez votre compte via le lien reçu par e-mail avant de commander.",
    status: 403,
  },
  COUPON_INVALID: { message: "Code promo invalide", status: 400 },
  COUPON_EXPIRED: { message: "Code promo expiré", status: 400 },
  ORDER_NOT_REFUNDABLE: { message: "Commande non remboursable", status: 400 },
  SUMUP_REFUND_TXN_MISSING: { message: "Remboursement impossible pour le moment", status: 400 },
  VIVA_REFUND_TXN_MISSING: { message: "Remboursement impossible pour le moment", status: 400 },
  ORDER_NOT_SHIPPABLE: { message: "Commande non expédiable (statut invalide)", status: 400 },
  TRACKING_REQUIRED: {
    message: "Saisissez le numéro de suivi transporteur avant d'expédier.",
    status: 400,
  },
  INVALID_STATUS_TRANSITION: { message: "Transition de statut non autorisée", status: 400 },
  FIDELE_A_TOUT_NOT_CONFIGURED: {
    message: "Fidèle à Tout n'est pas encore configuré.",
    status: 503,
  },
  FIDELE_A_TOUT_API_NOT_IMPLEMENTED: {
    message: "API Fidèle à Tout prête — accès officiels à renseigner.",
    status: 503,
  },
  "2FA_REQUIRED": {
    message: "Code d'authentification à deux facteurs requis.",
    status: 401,
  },
  "2FA_INVALID": { message: "Code 2FA invalide.", status: 401 },
  "2FA_NOT_SETUP": { message: "Configurez d'abord la 2FA.", status: 400 },
  MUST_CHANGE_PASSWORD: {
    message: "Changement de mot de passe obligatoire.",
    status: 403,
  },
  CSRF_REJECTED: { message: "Origine non autorisée", status: 403 },
  RATE_LIMITED: { message: "Trop de tentatives. Réessayez plus tard.", status: 429 },
  CHECKOUT_FORBIDDEN: { message: "Paiement non autorisé pour cette commande", status: 403 },
  STOCK_INSUFFICIENT: {
    message: "Désolé, un ou plusieurs produits ne sont plus disponibles.",
    status: 409,
  },
  STOCK_UNKNOWN: {
    message: "Le stock est en cours de vérification. Merci de réessayer dans quelques instants.",
    status: 503,
  },
  STOCK_VERIFYING: {
    message: "Le stock est en cours de vérification. Merci de réessayer dans quelques instants.",
    status: 503,
  },
};

export function jsonResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: error.flatten() },
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    const code =
      "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : error.message;
    const known = knownErrors[code] || knownErrors[error.message];
    if (known) {
      return NextResponse.json({ error: known.message }, { status: known.status });
    }
    console.error("API Error:", error.message);
  }

  return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
}
