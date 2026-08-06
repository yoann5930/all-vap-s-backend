/**
 * Mode AUDIT_ONLY — contrôle serveur uniquement.
 * Jamais activé par le frontend seul.
 */
import { createHash, timingSafeEqual } from "crypto";
import prisma from "@/lib/prisma";

export const AUDIT_SETTING_KEY = "ava.audit_mode";

export type AuditModeState = {
  enabled: boolean;
  campaignId: string | null;
  secretHash: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  activatedBy: string | null;
  allowOutOfStock: boolean;
};

const DISABLED: AuditModeState = {
  enabled: false,
  campaignId: null,
  secretHash: null,
  activatedAt: null,
  expiresAt: null,
  activatedBy: null,
  allowOutOfStock: false,
};

export function hashAuditSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function secretsEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export async function getAuditModeState(): Promise<AuditModeState> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: AUDIT_SETTING_KEY } });
    if (!row?.valueJson || typeof row.valueJson !== "object") {
      return { ...DISABLED };
    }
    const v = row.valueJson as Partial<AuditModeState>;
    const state: AuditModeState = {
      enabled: !!v.enabled,
      campaignId: v.campaignId || null,
      secretHash: v.secretHash || null,
      activatedAt: v.activatedAt || null,
      expiresAt: v.expiresAt || null,
      activatedBy: v.activatedBy || null,
      allowOutOfStock: v.allowOutOfStock !== false,
    };

    // Env peut forcer l'extinction
    if (process.env.AUDIT_MODE_ENABLED === "false") {
      return { ...state, enabled: false };
    }

    if (state.enabled && state.expiresAt) {
      const exp = new Date(state.expiresAt).getTime();
      if (Number.isFinite(exp) && Date.now() > exp) {
        await deactivateAuditMode({ reason: "expired", actorUserId: null });
        return { ...DISABLED };
      }
    }
    return state;
  } catch {
    return { ...DISABLED };
  }
}

export async function isAuditModeActive(): Promise<boolean> {
  if (process.env.AUDIT_MODE_ENABLED === "false") return false;
  const state = await getAuditModeState();
  return state.enabled === true && !!state.campaignId;
}

/** Vérifie le secret campagne (header x-audit-secret ou body). */
export async function verifyAuditSecret(provided: string | null | undefined): Promise<boolean> {
  if (!provided) return false;
  const state = await getAuditModeState();
  if (!state.enabled || !state.secretHash) {
    // Fallback env pour bootstrap
    const envSecret = process.env.AUDIT_MODE_SECRET || "";
    if (!envSecret) return false;
    return secretsEqual(hashAuditSecret(provided), hashAuditSecret(envSecret));
  }
  return secretsEqual(hashAuditSecret(provided), state.secretHash);
}

export async function activateAuditMode(params: {
  campaignId: string;
  secret: string;
  expiresAt: Date;
  actorUserId: string;
  allowOutOfStock?: boolean;
}): Promise<AuditModeState> {
  if (!params.campaignId.trim()) throw new Error("AUDIT_CAMPAIGN_REQUIRED");
  if (!params.secret || params.secret.length < 16) throw new Error("AUDIT_SECRET_WEAK");
  if (params.expiresAt.getTime() <= Date.now()) throw new Error("AUDIT_EXPIRES_INVALID");

  const state: AuditModeState = {
    enabled: true,
    campaignId: params.campaignId.trim(),
    secretHash: hashAuditSecret(params.secret),
    activatedAt: new Date().toISOString(),
    expiresAt: params.expiresAt.toISOString(),
    activatedBy: params.actorUserId,
    allowOutOfStock: params.allowOutOfStock !== false,
  };

  await prisma.appSetting.upsert({
    where: { key: AUDIT_SETTING_KEY },
    create: { key: AUDIT_SETTING_KEY, valueJson: state, updatedBy: params.actorUserId },
    update: { valueJson: state, updatedBy: params.actorUserId },
  });

  await prisma.auditModeLog.create({
    data: {
      campaignId: state.campaignId!,
      action: "activate",
      actorUserId: params.actorUserId,
      allowOutOfStock: state.allowOutOfStock,
      expiresAt: params.expiresAt,
      metaJson: { activatedAt: state.activatedAt },
    },
  });

  return state;
}

export async function deactivateAuditMode(params: {
  actorUserId: string | null;
  reason: string;
}): Promise<AuditModeState> {
  const prev = await getAuditModeState();
  await prisma.appSetting.upsert({
    where: { key: AUDIT_SETTING_KEY },
    create: { key: AUDIT_SETTING_KEY, valueJson: DISABLED, updatedBy: params.actorUserId || undefined },
    update: { valueJson: DISABLED, updatedBy: params.actorUserId || undefined },
  });
  if (prev.campaignId) {
    await prisma.auditModeLog.create({
      data: {
        campaignId: prev.campaignId,
        action: "deactivate",
        actorUserId: params.actorUserId,
        allowOutOfStock: false,
        metaJson: { reason: params.reason, previousExpiresAt: prev.expiresAt },
      },
    });
  }
  return { ...DISABLED };
}

export function publicAuditStatus(state: AuditModeState) {
  return {
    enabled: state.enabled,
    campaignId: state.campaignId,
    activatedAt: state.activatedAt,
    expiresAt: state.expiresAt,
    allowOutOfStock: state.enabled ? state.allowOutOfStock : false,
    // jamais le hash
  };
}
