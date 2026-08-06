/**
 * Client Fidèle à Tout — stubs typés, aucun appel inventé.
 * Remplir FIDELE_A_TOUT_* puis implémenter les appels HTTP réels.
 */

import { getFideleAToutConfig } from "./config";

export class FideleAToutNotConfiguredError extends Error {
  code = "FIDELE_A_TOUT_NOT_CONFIGURED" as const;
  constructor(message = "Fidèle à Tout n'est pas encore configuré") {
    super(message);
    this.name = "FideleAToutNotConfiguredError";
  }
}

export type FideleMemberLookup = {
  memberId: string;
  barcode?: string | null;
  qrPayload?: string | null;
  phone?: string | null;
  pointsBalance?: number | null;
};

export type FideleSyncResult = {
  ok: boolean;
  memberId?: string;
  pointsBalance?: number;
  dryRun?: boolean;
  message: string;
};

function assertConfigured() {
  const cfg = getFideleAToutConfig();
  if (!cfg.configured) {
    throw new FideleAToutNotConfiguredError();
  }
  return cfg;
}

/**
 * Recherche membre par téléphone (boutique / POS).
 * Non opérationnel tant que l'API officielle n'est pas documentée et branchée.
 */
export async function lookupMemberByPhone(_phone: string): Promise<FideleMemberLookup | null> {
  assertConfigured();
  // TODO: brancher l'endpoint officiel Fidèle à Tout dès réception de la doc API.
  throw new Error("FIDELE_A_TOUT_API_NOT_IMPLEMENTED");
}

/**
 * Recherche par QR / code-barres scanné (effet miroir).
 */
export async function lookupMemberByScan(
  _payload: string
): Promise<FideleMemberLookup | null> {
  assertConfigured();
  throw new Error("FIDELE_A_TOUT_API_NOT_IMPLEMENTED");
}

/**
 * Pousse / tire le solde points pour un client All Vap's lié.
 * En mode test : dry-run sans mutation distante.
 */
export async function syncMemberPoints(params: {
  userId: string;
  memberId: string;
  delta?: number;
  reason?: string;
}): Promise<FideleSyncResult> {
  const cfg = assertConfigured();
  if (cfg.testMode) {
    return {
      ok: true,
      memberId: params.memberId,
      dryRun: true,
      message:
        "Mode test Fidèle à Tout : synchronisation simulée en dry-run (aucun point distant modifié).",
    };
  }
  throw new Error("FIDELE_A_TOUT_API_NOT_IMPLEMENTED");
}

export async function linkMemberToUser(_params: {
  userId: string;
  memberId: string;
  barcode?: string;
  qrPayload?: string;
}): Promise<FideleSyncResult> {
  assertConfigured();
  throw new Error("FIDELE_A_TOUT_API_NOT_IMPLEMENTED");
}
