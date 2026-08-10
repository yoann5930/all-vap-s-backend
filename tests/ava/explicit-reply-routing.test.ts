/**
 * Non-régression : consigne « Réponds uniquement : … » = conversationnel, 0 outil métier.
 * npm exec tsx tests/ava/explicit-reply-routing.test.ts
 */
import { detectSocialMove } from "../../lib/ava/admin-social/detect";
import {
  isExplicitReplyInstruction,
  parseExplicitReplyInstruction,
} from "../../lib/ava/admin-social/explicit-reply";
import { selectAdminTools } from "../../lib/ava/admin-tools/select-tools";
import { answerAdminAvaConversation } from "../../lib/ava-gestion/admin-conversation";

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
  const historyOrders = [
    { role: "user" as const, content: "montre les commandes" },
    {
      role: "assistant" as const,
      content: "Voici le rapport commandes du jour.",
    },
  ];

  console.log("\n=== EXPLICIT REPLY ROUTING ===");

  assert(isExplicitReplyInstruction(MSG), "detects explicit reply instruction");
  assert(
    parseExplicitReplyInstruction(MSG) === "PONG_ADMIN_PROD",
    "parses token PONG_ADMIN_PROD"
  );
  assert(
    !isExplicitReplyInstruction("uniquement Hautmont"),
    "does not treat store follow-up as explicit reply"
  );

  const cold = detectSocialMove(MSG, [], null);
  assert(cold.wantTools === false, "detect cold: wantTools=false");
  assert(cold.move === "smalltalk", "detect cold: smalltalk");
  assert(cold.resolvedSubject === null, "detect cold: no subject");

  const hot = detectSocialMove(MSG, historyOrders, {
    status: "open",
    subject: "commandes",
    summary: "rapport commandes",
    updatedAt: new Date().toISOString(),
  });
  assert(hot.wantTools === false, "detect hot (orders thread): wantTools=false");
  assert(
    hot.resolvedSubject === null,
    "detect hot: clears inherited orders subject"
  );

  const toolsCold = selectAdminTools(MSG, []);
  assert(toolsCold.tools.length === 0, "selectTools cold: no tools");
  assert(
    toolsCold.needsClarification === false,
    "selectTools cold: no business clarification"
  );
  assert(toolsCold.intentLabel === "explicit_reply", "selectTools cold: label");

  const toolsHot = selectAdminTools(MSG, historyOrders);
  assert(toolsHot.tools.length === 0, "selectTools hot: no inherited order tools");
  assert(
    !toolsHot.tools.includes("getOrdersReport"),
    "selectTools hot: not getOrdersReport"
  );
  assert(
    toolsHot.needsClarification === false,
    "selectTools hot: no unclear/commande clarification"
  );

  const reply = await answerAdminAvaConversation({
    message: MSG,
    history: historyOrders,
    role: "ADMIN",
    userId: "test_explicit_reply_owner",
    conversationId: "test_explicit_reply",
    sessionIdentity: {
      email: "yoann@allvaps.fr",
      appRole: "OWNER",
      effectiveRole: "ADMIN",
    },
  });

  assert(reply.text === "PONG_ADMIN_PROD", `reply text exact (got: ${reply.text})`);
  assert(
    (reply.toolsUsed || []).length === 0,
    "conversation: toolsUsed empty"
  );
  assert(
    reply.source === "admin_ava_explicit_reply",
    `source explicit_reply (got: ${reply.source})`
  );
  assert(
    !/commande|stock|dates/i.test(reply.text),
    "reply has no business leakage"
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
