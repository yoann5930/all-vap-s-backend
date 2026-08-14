/**
 * Routeur HTTP AVA — pas de Prisma, pas d'écriture stock.
 */
import { readFileSync } from "node:fs";
import {
  avaEndpointManifest,
  isForbiddenAvaAction,
  parseAvaPublicAction,
  resolveAvaChannel,
} from "../../lib/ava/central-router";

const routeSrc = readFileSync("app/api/ava/route.ts", "utf8");

let fail = 0;
function assert(cond: boolean, label: string) {
  if (!cond) {
    fail++;
    console.error("FAIL", label);
  } else {
    console.log("OK", label);
  }
}

assert(parseAvaPublicAction(undefined) === "conversation", "action défaut conversation");
assert(parseAvaPublicAction("conversation") === "conversation", "conversation");
assert(parseAvaPublicAction("end_session") === "end_session", "end_session");
assert(parseAvaPublicAction("catalog") === "conversation", "catalog devient outil interne");
assert(parseAvaPublicAction("web_search") === "conversation", "web_search devient outil interne");
assert(parseAvaPublicAction("apply-stock") === "forbidden", "apply-stock interdit");
assert(parseAvaPublicAction("write_inventory") === "forbidden", "write_inventory interdit");
assert(parseAvaPublicAction("modify_stock") === "forbidden", "modify_stock interdit");
assert(parseAvaPublicAction("delete_product") === "forbidden", "delete_product interdit");
assert(isForbiddenAvaAction("applyStoreSale"), "applyStoreSale interdit");
assert(isForbiddenAvaAction("REFUND"), "REFUND interdit");
assert(resolveAvaChannel({ authenticated: false, role: null }) === "ANDROID", "anonyme = ANDROID");
assert(
  resolveAvaChannel({ authenticated: true, role: "EMPLOYEE" }) === "ANDROID",
  "employé sans admin ≠ ADMIN_WEB",
);
assert(
  resolveAvaChannel({ authenticated: true, role: "ADMIN" }) === "ADMIN_WEB",
  "ADMIN authentifié = ADMIN_WEB",
);
assert(avaEndpointManifest().stock === "read-only", "manifest stock read-only");
assert(!avaEndpointManifest().actions.includes("apply-stock" as never), "pas d'action apply-stock");
assert(!routeSrc.includes("prisma"), "route HTTP sans Prisma");
assert(!routeSrc.includes("apply-stock"), "route HTTP sans apply-stock");
assert(!routeSrc.includes("StockLevel"), "route HTTP sans StockLevel");
assert(!routeSrc.includes("writeInventory"), "route HTTP sans writeInventory");
assert(routeSrc.includes("runAvaBrain"), "route délègue au cerveau");
assert(routeSrc.includes("resolveAvaChannel"), "canal depuis auth serveur");
assert(!routeSrc.includes("parsed.data.context?.employeeId"), "employeeId client non fiable");
assert(routeSrc.includes("personIdFromEmail"), "identité mémoire depuis auth serveur");

if (fail) process.exit(1);
console.log("OK central router AVA");
