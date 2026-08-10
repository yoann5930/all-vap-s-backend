/**
 * Non-régression AVA client : « Réponds uniquement : PONG… » ne doit PAS
 * passer par le catalogue (« Je n'ai pas trouvé de produit… »).
 *
 * npm exec tsx tests/ava/explicit-reply-client.test.ts
 */
import { chatAva } from "../../lib/ai/ava-advisor";
import { detectClientIntent } from "../../lib/ai/ava/client-intent-router";
import { parseExplicitReplyInstruction } from "../../lib/ava/admin-social/explicit-reply";
import { emptyConversationContext } from "../../lib/ai/ava/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  OK  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}`);
  }
}

async function main() {
  const MSG = "Réponds uniquement : PONG_ADMIN_PROD";

  console.log("\n=== EXPLICIT REPLY — AVA CLIENT ===");

  assert(
    parseExplicitReplyInstruction(MSG) === "PONG_ADMIN_PROD",
    "parse token"
  );
  assert(
    detectClientIntent(MSG, null) === "EXPLICIT_REPLY",
    "intent EXPLICIT_REPLY (not PRODUCT_SEARCH)"
  );
  assert(
    detectClientIntent(MSG, emptyConversationContext()) === "EXPLICIT_REPLY",
    "intent EXPLICIT_REPLY with context"
  );

  const reply = await chatAva(undefined, MSG, {
    conversationContext: emptyConversationContext(),
  });

  assert(
    reply.content === "PONG_ADMIN_PROD",
    `content exact PONG_ADMIN_PROD (got: ${reply.content.slice(0, 120)})`
  );
  assert(
    (reply.products || []).length === 0,
    "no catalog products attached"
  );
  assert(
    !/pas trouv[eé] de produit|catalogue|saveur|mat[eé]riel/i.test(reply.content),
    "no catalog fallback wording"
  );
  assert(reply.blocked !== true, "not age-blocked");

  // Non-régression : follow-up boutique reste métier
  assert(
    detectClientIntent("uniquement Hautmont", null) !== "EXPLICIT_REPLY",
    "store follow-up is not EXPLICIT_REPLY"
  );

  console.log(
    `\n=== RESULT ${failed ? "FAIL" : "PASS"} (${passed} ok, ${failed} fail) ===\n`
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
