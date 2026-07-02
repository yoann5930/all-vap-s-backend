import { initAva, chatAva } from "@/lib/ai/ava-advisor";

export { initAva as initHolographicAssistant, chatAva as chatHolographicAssistant };
export type { AvaReply as AssistantReply } from "@/lib/ai/ava-advisor";

export interface AssistantInit {
  message: string;
  suggestions: string[];
  isLoggedIn: boolean;
  agentName: string;
}
