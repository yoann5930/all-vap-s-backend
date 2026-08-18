/**
 * Garde-fou WRITE : la passerelle de test n'importe aucun module
 * d'écriture stock / commande / paiement / fidélité / e-mail.
 * Contrôle statique dans tests/ava/ava-test-gateway.test.ts.
 */

export const AVA_TEST_WRITE_SCOPE = "READ_PLUS_SIMULATE" as const;

export const AVA_TEST_FORBIDDEN_WRITE_IMPORTS = [
  "lib/orders/create",
  "lib/payments",
  "lib/fidelatoo",
  "lib/email",
  "lib/shipping",
  "upsertStock",
  "createOrder",
  "chargePayment",
] as const;

/** La passerelle n'attache jamais un userId réel à chatAva. */
export const AVA_TEST_ENGINE_USER_ID: undefined = undefined;
