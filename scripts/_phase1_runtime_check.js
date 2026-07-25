const BASE = process.env.BASE_URL || "http://localhost:3000";

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 120);
  }
  return { status: res.status, body, headers: res.headers };
}

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() || [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  const results = [];
  const log = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "OK" : "FAIL"} | ${name} | ${detail}`);
  };

  // Health
  {
    const r = await req("/api/health");
    log("health", r.status === 200 && r.body.mode === "database", JSON.stringify(r.body));
  }

  // Pages
  for (const p of ["/", "/boutique", "/cart", "/checkout", "/login", "/admin", "/checkout/pay", "/checkout/success"]) {
    const r = await req(p);
    const ok = r.status === 200 || r.status === 307 || r.status === 308;
    log(`page ${p}`, ok, `status=${r.status}`);
  }

  // Catalog
  {
    const r = await req("/api/products");
    const count = Array.isArray(r.body) ? r.body.length : r.body?.products?.length ?? r.body?.items?.length ?? "?";
    log("api products", r.status === 200, `status=${r.status} count=${count}`);
  }
  {
    const r = await req("/api/categories");
    const count = Array.isArray(r.body) ? r.body.length : r.body?.categories?.length ?? "?";
    log("api categories", r.status === 200, `status=${r.status} count=${count}`);
  }
  {
    const r = await req("/api/search?q=geek");
    log("api search", r.status === 200, `status=${r.status}`);
  }

  // Payments providers
  {
    const r = await req("/api/payments/checkout");
    const viva = r.body?.providers?.find((p) => p.id === "viva");
    log(
      "payments providers",
      r.status === 200 && !!viva,
      JSON.stringify(r.body)
    );
  }

  // Auth login admin
  let cookie = "";
  {
    const r = await req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@allvaps.fr", password: "Admin123!" }),
    });
    cookie = cookieFrom(r);
    log("auth login", r.status === 200 && !!r.body?.user, `status=${r.status} hasCookie=${!!cookie}`);
  }

  // Auth me
  {
    const r = await req("/api/auth/me", { headers: cookie ? { Cookie: cookie } : {} });
    log("auth me", r.status === 200 && r.body?.user?.role === "ADMIN", `status=${r.status} role=${r.body?.user?.role}`);
  }

  // Admin API
  {
    const r = await req("/api/admin/stats", { headers: cookie ? { Cookie: cookie } : {} });
    log("admin stats", r.status === 200, `status=${r.status}`);
  }

  // Account without auth
  {
    const r = await req("/api/account/loyalty");
    log("account loyalty unauthorized", r.status === 401, `status=${r.status}`);
  }

  // Forgot password
  {
    const r = await req("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "admin@allvaps.fr" }),
    });
    log("forgot password", r.status === 200 && !!r.body?.message, `status=${r.status}`);
  }

  // Create order (guest) then payment checkout attempt
  let orderId = null;
  let productId = null;
  {
    const pr = await req("/api/products");
    const list = Array.isArray(pr.body) ? pr.body : pr.body?.products || pr.body?.items || [];
    productId = list[0]?.id;
    log("pick product", !!productId, `id=${productId || "none"}`);
  }

  if (productId) {
    const r = await req("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        customerEmail: "phase1@example.com",
        customerName: "Phase One",
        shippingAddress: "1 rue Test",
        deliveryMethod: "COLISSIMO",
        paymentProvider: "VIVA",
        items: [{ productId, quantity: 1 }],
      }),
    });
    orderId = r.body?.id;
    log("create order", r.status === 201 && !!orderId, `status=${r.status} orderId=${orderId || r.body?.error}`);
  }

  if (orderId) {
    const r = await req("/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ orderId, provider: "viva" }),
    });
    // Expect 503 VIVA_NOT_CONFIGURED when keys empty — code path must respond cleanly
    const ok =
      (r.status === 503 && String(r.body?.error || "").toLowerCase().includes("viva")) ||
      (r.status === 200 && !!r.body?.redirectUrl);
    log("payment viva checkout", ok, `status=${r.status} body=${JSON.stringify(r.body)}`);
  }

  if (orderId) {
    const r = await req(`/api/payments/status?orderId=${encodeURIComponent(orderId)}`);
    log("payment status", r.status === 200, `status=${r.status} body=${JSON.stringify(r.body)}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("---");
  console.log(`TOTAL:${results.length} FAIL:${failed.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("SCRIPT_ERR", e);
  process.exit(1);
});
