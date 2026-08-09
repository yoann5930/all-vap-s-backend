/**
 * Double vérification optionnelle — modèles A puis B, puis orchestrateur.
 * Réservé aux opérations admin importantes (pas chaque message).
 */
import { chatWithEngineRole } from "./model-router";
import type { LocalChatMessage } from "./types";

export type DualVerifyResult = {
  ok: boolean;
  proposal: string | null;
  review: string | null;
  final: string | null;
  proposalModel: string | null;
  reviewModel: string | null;
  agreed: boolean;
};

export async function dualVerifyAdminProposal(params: {
  system: string;
  user: string;
  enabled?: boolean;
}): Promise<DualVerifyResult | null> {
  if (!params.enabled) return null;

  const messages: LocalChatMessage[] = [
    { role: "system", content: params.system },
    { role: "user", content: params.user },
  ];

  const proposal = await chatWithEngineRole({
    role: "reasoning",
    messages,
    maxTokens: 400,
    temperature: 0.35,
    logTag: "ava-dual-A",
  });

  if (!proposal.ok || !proposal.text) {
    return {
      ok: false,
      proposal: null,
      review: null,
      final: null,
      proposalModel: proposal.model,
      reviewModel: null,
      agreed: false,
    };
  }

  const review = await chatWithEngineRole({
    role: "json_extract",
    messages: [
      {
        role: "system",
        content:
          "Tu es le vérificateur A.V.A. Critique la proposition. JSON {\"ok\":boolean,\"risks\":string,\"amendment\":string}. Pas de secrets.",
      },
      {
        role: "user",
        content: `PROPOSITION:\n${proposal.text}\n\nDEMANDE:\n${params.user}`,
      },
    ],
    maxTokens: 250,
    temperature: 0.1,
    jsonMode: true,
    logTag: "ava-dual-B",
  });

  let agreed = false;
  let amendment: string | null = null;
  try {
    const j = JSON.parse((review.text || "").replace(/```json|```/g, "").trim()) as {
      ok?: boolean;
      amendment?: string;
    };
    agreed = Boolean(j.ok);
    amendment = j.amendment || null;
  } catch {
    agreed = false;
  }

  const final = agreed
    ? proposal.text
    : amendment
      ? `${proposal.text}\n\n(Ajustement vérificateur : ${amendment})`
      : proposal.text;

  return {
    ok: Boolean(final),
    proposal: proposal.text,
    review: review.text,
    final,
    proposalModel: proposal.model,
    reviewModel: review.model,
    agreed,
  };
}
