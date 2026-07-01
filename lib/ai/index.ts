/**
 * AI module — architecture préparée pour intégrations futures.
 * Connecter un provider (OpenAI, Anthropic, etc.) via AI_PROVIDER env.
 */

export type AIServiceId = "vape-advisor" | "eliquid-recommender" | "pokemon-estimator";

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIRequest {
  service: AIServiceId;
  messages: AIMessage[];
  userId?: string;
  context?: Record<string, unknown>;
}

export interface AIResponse {
  service: AIServiceId;
  content: string;
  suggestions?: string[];
}

export interface AIProvider {
  id: string;
  isConfigured(): boolean;
  chat(request: AIRequest): Promise<AIResponse>;
}

const STUB_RESPONSES: Record<AIServiceId, string> = {
  "vape-advisor":
    "Service IA conseil vape bientôt disponible. En attendant, nos experts vous accueillent en boutique All Vap's.",
  "eliquid-recommender":
    "Recommandation e-liquides IA en cours de développement. Consultez notre catalogue e-liquides.",
  "pokemon-estimator":
    "Estimation cartes Pokémon IA — fonctionnalité à venir.",
};

class StubAIProvider implements AIProvider {
  id = "stub";

  isConfigured() {
    return true;
  }

  async chat(request: AIRequest): Promise<AIResponse> {
    return {
      service: request.service,
      content: STUB_RESPONSES[request.service],
      suggestions: ["Voir la boutique", "Nous contacter"],
    };
  }
}

import { LocalAIProvider } from "@/lib/ai/local-advisor-provider";

export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER;
  if (provider && provider !== "local" && provider !== "stub") {
    // Future: OpenAI, Anthropic, etc.
  }
  return new LocalAIProvider();
}

export async function askAI(request: AIRequest): Promise<AIResponse> {
  return getAIProvider().chat(request);
}

export const AI_SERVICES: Array<{ id: AIServiceId; name: string; description: string }> = [
  {
    id: "vape-advisor",
    name: "Conseil Vape IA",
    description: "Trouvez la cigarette électronique adaptée à vos besoins",
  },
  {
    id: "eliquid-recommender",
    name: "Recommandation E-liquides",
    description: "Découvrez les saveurs qui vous correspondent",
  },
  {
    id: "pokemon-estimator",
    name: "Estimation Cartes Pokémon",
    description: "Estimez la valeur de vos cartes collection",
  },
];
