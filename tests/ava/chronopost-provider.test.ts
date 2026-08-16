import { deliveryMethodToCarrier } from "../../lib/shipping/carriers";
import { carrierServiceForDeliveryMethod } from "../../lib/shipping/carrier-service";
import { assertNoPaidShipping } from "../../lib/shipping/real-shipping-guard";
import { AvaShippingProviders } from "../../lib/ava/tools/shipping-status";

let fail = 0;
function assert(cond: boolean, label: string) {
  if (!cond) {
    fail++;
    console.error("FAIL", label);
  } else console.log("OK", label);
}

assert(deliveryMethodToCarrier("CHRONOPOST") === "chronopost", "enum CHRONOPOST → carrier");
assert(deliveryMethodToCarrier("MONDIAL_RELAY") === "mondial-relay", "MR inchangé");
assert(deliveryMethodToCarrier("RELAIS_COLIS") === "relais-colis", "RC inchangé");
assert(carrierServiceForDeliveryMethod("CHRONOPOST")?.id === "chronopost", "service Chronopost");
assert(AvaShippingProviders.CHRONOPOST.id === "CHRONOPOST", "spoken provider Chronopost");

const prevDemo = process.env.DEMO_MODE;
process.env.DEMO_MODE = "true";
const blocked = assertNoPaidShipping("chronopost_label");
assert(blocked.allowed === false, "DEMO bloque étiquette Chronopost");
if (prevDemo === undefined) delete process.env.DEMO_MODE;
else process.env.DEMO_MODE = prevDemo;

if (fail) process.exit(1);
console.log("OK chronopost-provider");
