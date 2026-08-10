/**
 * Smoke HMAC local — génère une requête signée vers le gateway.
 * N'affiche jamais le secret complet.
 */
import { randomBytes } from "node:crypto";
import { loadConfig } from "./config.js";
import { signPayload, fingerprintSecret } from "./auth.js";

async function main() {
  const cfg = loadConfig();
  if (cfg.secret.length < 32) {
    console.error("SECRET missing");
    process.exit(2);
  }
  console.log("secret", fingerprintSecret(cfg.secret));

  const body = JSON.stringify({
    model: cfg.primaryModel,
    messages: [
      { role: "system", content: "Reply with exactly: PONG_GW" },
      { role: "user", content: "ping" },
    ],
    maxTokens: 16,
    temperature: 0,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const signature = signPayload(cfg.secret, body, timestamp, nonce);

  const url = `http://${cfg.host}:${cfg.port}/v1/ava/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Allvaps-Timestamp": timestamp,
      "X-Allvaps-Nonce": nonce,
      "X-Allvaps-Signature": signature,
    },
    body,
  });
  const text = await res.text();
  console.log("HTTP", res.status, text.slice(0, 300));

  // Replay nonce → must fail
  const res2 = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Allvaps-Timestamp": timestamp,
      "X-Allvaps-Nonce": nonce,
      "X-Allvaps-Signature": signature,
    },
    body,
  });
  console.log("REPLAY", res2.status, (await res2.text()).slice(0, 120));

  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
