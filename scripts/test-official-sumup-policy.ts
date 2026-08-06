/**
 * Tests unitaires — politique e-liquides SumUp / officiel (sans DB).
 */
import {
  canPublishEliquideOnline,
  encodeOfficialNameProvenance,
  evaluateEliquidePublishGate,
  namesAreCompatible,
  resolveSafeDisplayName,
} from "../lib/catalog/official-sumup-policy";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  namesAreCompatible("Kuix Ananas 50ml", "Ananas — Kuix — 50 ml"),
  "kuix tokens compat"
);
assert(
  !namesAreCompatible("Fraise Sauvage 10ml", "Myrtille sauvage 10ml 0mg e-tasty"),
  "must reject wrong flavor"
);

const blocked = evaluateEliquidePublishGate({
  category: "e-liquides",
  productType: "50ml",
  name: "Test",
  sumupName: "Test 50ml",
  sumupProductId: "abc",
  imageStatus: "pending",
  imageUrl: null,
  priceCents: 1990,
});
assert(!blocked.canPublishOnline, "pending photo must block");
assert(blocked.anomalies.includes("photo_officielle_a_completer"), "anomaly photo");

const ok = evaluateEliquidePublishGate({
  category: "e-liquides",
  productType: "50ml",
  name: "Kuix Ananas 50ml",
  sumupName: "Kuix Ananas 50ml",
  sumupProductId: "abc",
  imageStatus: "official",
  imageUrl: "/media/products/liquide-lab/kuix/50ml/ananas.webp",
  priceCents: 2090,
});
assert(ok.canPublishOnline, "complete product must publish");
assert(canPublishEliquideOnline(ok && {
  category: "e-liquides",
  productType: "50ml",
  name: "Kuix Ananas 50ml",
  sumupName: "Kuix Ananas 50ml",
  sumupProductId: "abc",
  imageStatus: "official",
  imageUrl: "/media/products/liquide-lab/kuix/50ml/ananas.webp",
  priceCents: 2090,
}), "helper ok");

const official = resolveSafeDisplayName({
  sumupName: "Kuix Ananas 50ml",
  provenance: {
    kind: "official",
    sourceUrl: "https://liquidelab.com/",
    officialTitle: "Ananas Kuix 50 ml",
  },
});
assert(official.name === "Ananas Kuix 50 ml", "official title allowed with URL");

const mapping = encodeOfficialNameProvenance(
  "https://example.com/p",
  "Titre Officiel"
);
assert(mapping.includes("official"), "encode mapping");

console.log(JSON.stringify({ ok: true, tests: 6 }, null, 2));
