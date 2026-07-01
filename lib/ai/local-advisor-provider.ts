import type { AIRequest, AIResponse, AIProvider } from "@/lib/ai";
import { localVapeAdvisorChat } from "@/lib/ai/local-advisor";

/**
 * Provider local intelligent — prêt à être remplacé par OpenAI/Anthropic via AI_PROVIDER.
 */
export class LocalAIProvider implements AIProvider {
  id = "local";

  isConfigured() {
    return true;
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    if (request.service === "pokemon-estimator") {
      return {
        service: request.service,
        content: "Estimation cartes Pokémon — fonctionnalité à venir.",
        suggestions: ["Voir la boutique"],
      };
    }
    return localVapeAdvisorChat(request);
  }
}
