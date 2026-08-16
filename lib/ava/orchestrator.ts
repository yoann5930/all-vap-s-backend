/**
 * Orchestrateur métier unique — site, Android et /api/ava.
 * Les LLM (llama.cpp / serveur) ne décident pas stock, commande, mail, nicotine.
 */
import { runAvaBrain, type AvaBrainReply } from "@/lib/ava/unified-brain";
import type { AvaAudience, AvaSurface } from "@/lib/ava/ava-channels";
import type { AvaChannel } from "@/lib/ava/ava-core";
import { classifyAvaIntent } from "@/lib/ava/intents";
import { avaLog, newAvaCorrelationId } from "@/lib/ava/logging";

export type AvaOrchestratorInput = {
  channel: AvaChannel;
  message: string;
  sessionId: string;
  employeeId?: string | null;
  audience?: AvaAudience;
  surface?: AvaSurface;
  correlationId?: string;
};

export async function runAvaOrchestrator(
  input: AvaOrchestratorInput,
): Promise<AvaBrainReply & { correlationId: string; intent: string }> {
  const correlationId = input.correlationId || newAvaCorrelationId();
  const intent = classifyAvaIntent(input.message);
  avaLog("CORE", correlationId, "orchestrator", { intent, channel: input.channel });
  const brain = await runAvaBrain({
    ...input,
    correlationId,
  });
  return { ...brain, correlationId, intent };
}
