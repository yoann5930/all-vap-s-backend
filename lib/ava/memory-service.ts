/**
 * Mémoire AVA — lecture/écriture bornée. Jamais mot de passe, token, secret.
 */
import {
  loadSharedPersistentMemory,
  loadSharedSession,
  saveSharedFact,
  saveSharedSession,
  type AvaPersonId,
  type AvaSharedSession,
} from "@/lib/ava/shared-memory";
import { avaLog } from "@/lib/ava/logging";

const FORBIDDEN =
  /(password|mot de passe|token|secret|api[_-]?key|authorization|cvv|iban|carrier.?credential)/i;

export type AvaMemoryScope =
  | "SESSION"
  | "CLIENT"
  | "ORDER"
  | "TOOL_CONTEXT"
  | "BUSINESS_MEMORY"
  | "PERSISTENT_MEMORY";

function blocked(content: string): boolean {
  return FORBIDDEN.test(content);
}

export const AvaMemoryService = {
  async readSession(sessionId: string) {
    return loadSharedSession(sessionId);
  },
  async writeSession(session: AvaSharedSession) {
    await saveSharedSession(session);
  },
  async readPersistent(personId: AvaPersonId) {
    return loadSharedPersistentMemory(personId);
  },
  async writeFact(params: {
    personId: AvaPersonId;
    subject: string;
    content: string;
    correlationId: string;
    scope?: AvaMemoryScope;
  }) {
    if (blocked(params.content) || blocked(params.subject)) {
      avaLog("MEMORY", params.correlationId, "memory_write_blocked_secret");
      return null;
    }
    return saveSharedFact({
      personId: params.personId,
      kind: "confirmed_fact",
      subject: params.subject,
      content: params.content,
      source: "user",
    });
  },
  async clearSessionTurns(session: AvaSharedSession) {
    session.turns = [];
    await saveSharedSession(session);
  },
};
