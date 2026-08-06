import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const knownErrors: Record<string, { message: string; status: number }> = {
  UNAUTHORIZED: { message: "Non authentifié", status: 401 },
  FORBIDDEN: { message: "Accès refusé", status: 403 },
  EMAIL_EXISTS: { message: "Cet email est déjà utilisé", status: 409 },
  INVALID_CREDENTIALS: { message: "Email ou mot de passe incorrect", status: 401 },
  NOT_FOUND: { message: "Ressource introuvable", status: 404 },
  SUMUP_NOT_CONFIGURED: { message: "Paiement SumUp non configuré", status: 503 },
  VIVA_NOT_CONFIGURED: { message: "Paiement Viva.com non configuré", status: 503 },
  EMAIL_NOT_CONFIGURED: { message: "Envoi d'email non configuré", status: 503 },
  INVALID_TOKEN: { message: "Token invalide ou expiré", status: 400 },
  COUPON_INVALID: { message: "Code promo invalide", status: 400 },
  COUPON_EXPIRED: { message: "Code promo expiré", status: 400 },
  ORDER_NOT_REFUNDABLE: { message: "Commande non remboursable", status: 400 },
  SUMUP_REFUND_TXN_MISSING: { message: "Transaction SumUp introuvable pour remboursement", status: 400 },
  VIVA_REFUND_TXN_MISSING: { message: "Transaction Viva introuvable pour remboursement", status: 400 },
  ORDER_NOT_SHIPPABLE: { message: "Commande non expédiable (statut invalide)", status: 400 },
  INVALID_STATUS_TRANSITION: { message: "Transition de statut non autorisée", status: 400 },
  CSRF_REJECTED: { message: "Origine non autorisée", status: 403 },
  RATE_LIMITED: { message: "Trop de tentatives. Réessayez plus tard.", status: 429 },
  ACCOUNT_DISABLED: { message: "Compte désactivé", status: 403 },
  AUTH_DB_UNAVAILABLE: {
    message: "Authentification indisponible — base à migrer (prisma migrate deploy)",
    status: 503,
  },
  MUST_CHANGE_PASSWORD: { message: "Changement de mot de passe obligatoire", status: 403 },
  STORE_NOT_ALLOWED: { message: "Boutique non autorisée pour ce compte", status: 403 },
  WEAK_PASSWORD: { message: "Mot de passe trop faible (8 caractères min., lettre + chiffre)", status: 400 },
  SAME_PASSWORD: { message: "Le nouveau mot de passe doit être différent", status: 400 },
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
    const known = knownErrors[error.message];
    if (known) {
      return NextResponse.json({ error: known.message }, { status: known.status });
    }
    console.error("API Error:", error.message);
  }

  return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
}
