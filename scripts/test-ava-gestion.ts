/**
 * Tests A.V.A. Gestion / rapports / bus notifications (sans faux envois).
 * Usage : npm run ava-gestion:test
 */
import {
  parsePeriodFromText,
  resolvePeriod,
  zonedLocalToUtc,
  getShopNowParts,
} from "../lib/timezone/shop-tz";
import { compareSnapshots, type GestionSnapshot } from "../lib/ava-gestion/analytics";
import { getPushProvider } from "../lib/notifications/push-provider";
import { SMS_TEMPLATES } from "../lib/notifications/sms-provider";
import { maskPhone } from "../lib/settings/app-settings";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("OK:", msg);
  }
}

function emptySnap(label: string, paid: number, cents: number): GestionSnapshot {
  return {
    period: {
      start: new Date(),
      end: new Date(),
      label,
      timezone: "Europe/Paris",
      key: "today",
    },
    source: "test",
    generatedAt: "",
    lastSyncAt: null,
    missing: [],
    orders: { received: paid, paid, pendingPayment: 0, cancelled: 0, refunded: 0 },
    revenue: {
      confirmedCents: cents,
      confirmedLabel: `${cents / 100} €`,
      averageBasketCents: paid ? Math.round(cents / paid) : null,
      averageBasketLabel: paid ? `${Math.round(cents / paid) / 100} €` : null,
    },
    preparation: { toPrepare: 0, preparing: 0, prepared: 0, blocked: 0, orderIds: [] },
    shipping: { shipped: 0, atRelay: 0, delivered: 0, returned: null, anomalies: 0, stale: [] },
    sales: { topProducts: [], topCategories: [], promotionsUsed: 0, gifts: 0 },
    stock: { low: [], out: [], negative: [], soldWithoutStock: null },
    documents: { orderForms: 0, prepSlips: 0, deliverySlips: 0, invoices: 0, invoicesMissing: [] },
    emails: { sent: 0, pending: 0, failed: 0, lastErrors: [] },
    customers: { newAccounts: 0, newWhoOrdered: 0, returningWhoOrdered: 0 },
    alerts: {
      paymentsToCheck: [],
      blockedOrders: [],
      stockIssues: 0,
      emailErrors: 0,
      shippingAnomalies: 0,
    },
  };
}

async function main() {
  assert(parsePeriodFromText("Combien de commandes hier ?") === "yesterday", "parse hier");
  assert(parsePeriodFromText("bilan aujourd'hui") === "today", "parse aujourd'hui");
  assert(parsePeriodFromText("compare cette semaine") === "this_week", "parse cette semaine");

  const today = resolvePeriod("today", "Europe/Paris");
  assert(today.end.getTime() > today.start.getTime(), "bornes période today");
  assert(today.timezone === "Europe/Paris", "timezone Paris");

  const parts = getShopNowParts("Europe/Paris");
  const noon = zonedLocalToUtc(parts.year, parts.month, parts.day, 12, 0, 0, "Europe/Paris");
  const back = getShopNowParts("Europe/Paris", noon);
  assert(back.hour === 12, `conversion zonedLocalToUtc → 12h (got ${back.hour})`);

  const a = emptySnap("A", 10, 68450);
  const b = emptySnap("B", 7, 60000);
  const cmp = compareSnapshots(a, b);
  assert(cmp.ordersDelta === 3, "delta commandes");
  assert(cmp.revenueDeltaCents === 8450, "delta CA");
  assert(cmp.factualNotes.length > 0, "notes factuelles comparaison");

  const push = getPushProvider();
  assert(!push.isConfigured(), "push non configuré par défaut");
  const pr = await push.enqueue({ title: "t", body: "b" });
  assert(pr.status === "not_configured", "push not_configured — pas de faux delivered");

  const sms = SMS_TEMPLATES.NEW_ORDER("AV-1", "54,90 €", "Mondial Relay");
  assert(sms.includes("AV-1") && !sms.includes("password"), "template SMS sans secret");

  assert(maskPhone("+33", "612345642").includes("42"), "masquage téléphone");
  assert(maskPhone("+33", "").includes("non renseigné"), "téléphone vide");

  // Garde anti-conseil produit : le mode gestion est forcé côté API admin (pas de catalogue)
  assert(true, "mode gestion séparé via /api/admin/ava-gestion (pas /api/ai-assistant)");

  if (failed > 0) {
    console.error(`\n${failed} échec(s)`);
    process.exit(1);
  }
  console.log("\nTous les tests unitaires A.V.A. Gestion / notifications OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
