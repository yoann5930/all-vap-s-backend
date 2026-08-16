import { AvaMemoryService } from "../../lib/ava/memory-service";

let fail = 0;
function assert(cond: boolean, label: string) {
  if (!cond) {
    fail++;
    console.error("FAIL", label);
  } else console.log("OK", label);
}

async function main() {
  const blocked = await AvaMemoryService.writeFact({
    personId: "yoann",
    subject: "secret",
    content: "password=hunter2",
    correlationId: "test",
  });
  assert(blocked === null, "refuse password");

  const token = await AvaMemoryService.writeFact({
    personId: "yoann",
    subject: "auth",
    content: "token abcdef",
    correlationId: "test",
  });
  assert(token === null, "refuse token");

  if (fail) process.exit(1);
  console.log("OK memory secrets");
}

void main();
