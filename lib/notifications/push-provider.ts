/**
 * PushProvider — interface générique (FCM / Web Push / autre).
 * Sans configuration : statut not_configured — jamais « delivered ».
 */

export type PushEnqueueResult = {
  status: "not_configured" | "queued" | "failed";
  provider: string | null;
  reason?: string;
};

export interface PushProvider {
  readonly name: string;
  isConfigured(): boolean;
  enqueue(message: {
    title: string;
    body: string;
    deepLink?: string;
    isTest?: boolean;
  }): Promise<PushEnqueueResult>;
}

class NullPushProvider implements PushProvider {
  readonly name = "none";
  isConfigured() {
    return false;
  }
  async enqueue(): Promise<PushEnqueueResult> {
    return {
      status: "not_configured",
      provider: null,
      reason: "Notifications push non configurées (PUSH_PROVIDER / PUSH_ENABLED).",
    };
  }
}

class StubConfiguredPushProvider implements PushProvider {
  readonly name = process.env.PUSH_PROVIDER || "stub";
  isConfigured() {
    return process.env.PUSH_ENABLED === "true" && !!process.env.PUSH_PROJECT_ID;
  }
  async enqueue(message: {
    title: string;
    body: string;
    deepLink?: string;
    isTest?: boolean;
  }): Promise<PushEnqueueResult> {
    if (!this.isConfigured()) {
      return {
        status: "not_configured",
        provider: this.name,
        reason: "Notifications push non configurées",
      };
    }
    if (message.isTest) {
      return {
        status: "queued",
        provider: this.name,
        reason: "MODE TEST — message mis en file locale, non envoyé au fournisseur.",
      };
    }
    // Pas d'appel réseau réel tant que le SDK n'est pas branché
    return {
      status: "queued",
      provider: this.name,
      reason: "Provider déclaré mais SDK non branché — file locale uniquement.",
    };
  }
}

export function getPushProvider(): PushProvider {
  if (process.env.PUSH_ENABLED === "true" && process.env.PUSH_PROJECT_ID) {
    return new StubConfiguredPushProvider();
  }
  return new NullPushProvider();
}

export async function enqueuePush(message: {
  title: string;
  body: string;
  deepLink?: string;
  isTest?: boolean;
}): Promise<PushEnqueueResult> {
  return getPushProvider().enqueue(message);
}
