import { AvaShippingProviders, speakAvaShipping } from "../../lib/ava/tools/shipping-status";
import { isForbiddenAutomaticFrom, resolveAvaFromAddress } from "../../lib/email/ava-identity";
import { checkupTargetFromMessage } from "../../lib/ava/health/checkup";
import { maxMgMl } from "../../lib/nicotine";

let fail = 0;
function assert(cond: boolean, label: string) {
  if (!cond) {
    fail++;
    console.error("FAIL", label);
  } else console.log("OK", label);
}

assert(AvaShippingProviders.MONDIAL_RELAY.id === "MONDIAL_RELAY", "mr id");
assert(AvaShippingProviders.RELAIS_COLIS.id === "RELAIS_COLIS", "rc id");
assert(AvaShippingProviders.CHRONOPOST.id === "CHRONOPOST", "chrono id");
const spoken = speakAvaShipping("t").spoken;
assert(spoken.includes("Mondial Relay"), "mr spoken");
assert(spoken.includes("Chronopost"), "chrono spoken");
assert(!spoken.toLowerCase().includes("ok") || spoken.includes("non configuré") || spoken.includes("démonstration"), "no fake OK");

assert(isForbiddenAutomaticFrom("yoann@allvaps.fr"), "block yoann");
assert(!isForbiddenAutomaticFrom("avaallvaps@gmail.com"), "ava mailbox allowed");
try {
  const from = resolveAvaFromAddress();
  assert(!isForbiddenAutomaticFrom(from), "resolved from not yoann");
} catch (e) {
  assert((e as Error).message === "AVA_SENDER_FORBIDDEN", "forbidden throws");
}

assert(checkupTargetFromMessage("AVA fais ton check-up") === "all", "checkup all");
assert(checkupTargetFromMessage("teste les stocks") === "stock", "checkup stock");
assert(maxMgMl("FREEBASE") === 15, "freebase 15");
assert(maxMgMl("SALT") === 20, "salt 20");

if (fail) process.exit(1);
console.log("OK shipping email checkup nicotine guards");
