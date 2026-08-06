/**
 * SmsProvider générique + passerelle Android (Samsung) — architecture seule.
 * Aucun SMS réel tant que SMS_ENABLED / ANDROID_GATEWAY_ENABLED ne sont pas actifs
 * et qu'aucun appareil passerelle n'est enregistré.
 */

import prisma from "@/lib/prisma";
import { getOwnerPhoneSettings, maskPhone } from "@/lib/settings/app-settings";

export type SmsEnqueueResult = {
  status: "not_configured" | "queued" | "failed";
  provider: string | null;
  reason?: string;
  outboxId?: string;
};

export interface SmsProvider {
  readonly name: string;
  isConfigured(): boolean;
  enqueue(input: {
    body: string;
    orderId?: string;
    eventId?: string;
    isTest?: boolean;
  }): Promise<SmsEnqueueResult>;
}

function providerName(): string {
  return process.env.SMS_PROVIDER || "android_gateway";
}

class AndroidGatewaySmsProvider implements SmsProvider {
  readonly name = "android_gateway";
  isConfigured() {
    return (
      process.env.ANDROID_GATEWAY_ENABLED === "true" &&
      !!process.env.ANDROID_GATEWAY_DEVICE_ID &&
      !!process.env.ANDROID_GATEWAY_SECRET
    );
  }
  async enqueue(input: {
    body: string;
    orderId?: string;
    eventId?: string;
    isTest?: boolean;
  }): Promise<SmsEnqueueResult> {
    const phone = await getOwnerPhoneSettings();
    const masked = maskPhone(phone.countryCode, phone.nationalNumber);
    const key = `sms:${input.eventId || "none"}:${input.orderId || "none"}:${Date.now()}`;

    if (input.isTest || !this.isConfigured() || !phone.nationalNumber || !phone.validated) {
      const row = await prisma.smsOutbox.create({
        data: {
          toMasked: masked,
          bodyPreview: input.body.slice(0, 160),
          status: input.isTest ? "queued" : "not_configured",
          provider: this.name,
          idempotencyKey: `${key}:nc`,
          isTest: !!input.isTest,
          relatedOrderId: input.orderId,
          eventId: input.eventId,
          lastError: input.isTest
            ? "MODE TEST — SMS non transmis à la carte SIM"
            : !phone.validated
              ? "Numéro non validé"
              : "Passerelle Android non configurée",
        },
      });
      return {
        status: input.isTest ? "queued" : "not_configured",
        provider: this.name,
        reason: row.lastError || undefined,
        outboxId: row.id,
      };
    }

    // File d'attente réelle pour future app Android — pas d'envoi HTTP tant que l'app n'existe pas
    const row = await prisma.smsOutbox.create({
      data: {
        toMasked: masked,
        bodyPreview: input.body.slice(0, 160),
        status: "queued",
        provider: this.name,
        gatewayDeviceId: process.env.ANDROID_GATEWAY_DEVICE_ID,
        idempotencyKey: key,
        relatedOrderId: input.orderId,
        eventId: input.eventId,
        lastError: "En file — en attente de polling par l'app passerelle Android",
      },
    });
    return {
      status: "queued",
      provider: this.name,
      reason: "Mis en file pour la passerelle Android (pas encore pollé).",
      outboxId: row.id,
    };
  }
}

class ExternalSmsProvider implements SmsProvider {
  readonly name = providerName();
  isConfigured() {
    return (
      process.env.SMS_ENABLED === "true" &&
      !!process.env.SMS_API_KEY &&
      !!process.env.SMS_API_URL
    );
  }
  async enqueue(input: {
    body: string;
    orderId?: string;
    eventId?: string;
    isTest?: boolean;
  }): Promise<SmsEnqueueResult> {
    const phone = await getOwnerPhoneSettings();
    const masked = maskPhone(phone.countryCode, phone.nationalNumber);
    if (!this.isConfigured() || input.isTest) {
      const row = await prisma.smsOutbox.create({
        data: {
          toMasked: masked,
          bodyPreview: input.body.slice(0, 160),
          status: input.isTest ? "queued" : "not_configured",
          provider: this.name,
          idempotencyKey: `ext:${input.eventId || "x"}:${Date.now()}`,
          isTest: !!input.isTest,
          relatedOrderId: input.orderId,
          eventId: input.eventId,
          lastError: input.isTest
            ? "MODE TEST"
            : "Fournisseur SMS externe non configuré",
        },
      });
      return {
        status: input.isTest ? "queued" : "not_configured",
        provider: this.name,
        reason: row.lastError || undefined,
        outboxId: row.id,
      };
    }
    // Pas d'appel API réel ici — éviter d'imposer Twilio/OVH
    return {
      status: "not_configured",
      provider: this.name,
      reason: "SDK fournisseur SMS non branché — architecture prête uniquement.",
    };
  }
}

export function getSmsProvider(channel?: "sms" | "android_gateway"): SmsProvider {
  if (channel === "android_gateway" || process.env.SMS_PROVIDER === "android_gateway") {
    return new AndroidGatewaySmsProvider();
  }
  if (process.env.SMS_ENABLED === "true") return new ExternalSmsProvider();
  return new AndroidGatewaySmsProvider();
}

export async function enqueueSms(input: {
  body: string;
  orderId?: string;
  eventId?: string;
  isTest?: boolean;
  channel?: "sms" | "android_gateway";
}): Promise<SmsEnqueueResult> {
  return getSmsProvider(input.channel).enqueue(input);
}

/** Templates SMS (non activés tant que passerelle absente). */
export const SMS_TEMPLATES = {
  NEW_ORDER: (orderId: string, amountLabel: string, delivery?: string) =>
    `All Vap's — Nouvelle commande ${orderId} : ${amountLabel}. Paiement confirmé.${delivery ? ` ${delivery}.` : ""}`,
  PAYMENT_CHECK: (orderId: string) =>
    `All Vap's — Le paiement de la commande ${orderId} doit être vérifié. Ne pas préparer avant validation.`,
  ORDER_BLOCKED: (orderId: string) =>
    `All Vap's — Commande ${orderId} bloquée : stock insuffisant.`,
  CRITICAL: () =>
    `All Vap's — Alerte critique : un service essentiel est indisponible. Consulte l'administration.`,
} as const;
