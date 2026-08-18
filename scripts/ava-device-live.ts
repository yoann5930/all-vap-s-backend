/**
 * Tests production de la passerelle appareil — n'imprime jamais les secrets.
 * Charge .local/ava-device.env (gitignored).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadLocalEnv() {
  const p = join(process.cwd(), ".local", "ava-device.env");
  if (!existsSync(p)) throw new Error("missing .local/ava-device.env");
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

function token(): string {
  const t = (process.env.AVA_DEVICE_GATEWAY_TOKEN || "").trim();
  if (t.length < 16) throw new Error("AVA_DEVICE_GATEWAY_TOKEN missing");
  return t;
}

const BASE = (process.env.AVA_DEVICE_BASE_URL || "https://www.allvaps.fr").replace(/\/$/, "");
const DEVICE = process.env.AVA_DEVICE_ALLOWED_IDS?.split(",")[0]?.trim() || "AVA-SAMSUNG-01";

async function req(path: string, opts: { method?: string; body?: unknown; auth?: string | null } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth === undefined) headers.Authorization = `Bearer ${token()}`;
  else if (opts.auth) headers.Authorization = opts.auth;
  const res = await fetch(BASE + path, {
    method: opts.method || "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

function redact(v: unknown): unknown {
  if (v && typeof v === "object") {
    const o = { ...(v as Record<string, unknown>) };
    for (const k of Object.keys(o)) {
      if (/token|secret|authorization|password|signature/i.test(k)) o[k] = "[redacted]";
      else if (k === "dataBase64" && typeof o[k] === "string") o[k] = `[jpeg ${String(o[k]).length} chars]`;
      else if (typeof o[k] === "object") o[k] = redact(o[k]);
    }
    return o;
  }
  return v;
}

async function waitJob(jobId: string, ms = 25_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const got = await req(`/api/internal/ava-device/jobs/${jobId}`);
    const job = (got.json as { job?: { status?: string; result?: unknown; errorCode?: string } }).job;
    if (job && (job.status === "done" || job.status === "error" || job.status === "rejected")) return got;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return req(`/api/internal/ava-device/jobs/${jobId}`);
}

async function command(name: string, args: Record<string, unknown> = {}) {
  const queued = await req("/api/internal/ava-device", {
    method: "POST",
    body: { deviceId: DEVICE, command: name, args, waitMs: 0 },
  });
  const jobId = (queued.json as { jobId?: string }).jobId;
  if (!jobId) return queued;
  return waitJob(jobId);
}

async function main() {
  loadLocalEnv();
  const step = process.argv[2] || "all";
  if (step === "auth") {
    const none = await req("/api/internal/ava-device?deviceId=" + DEVICE, { auth: null });
    const bad = await req("/api/internal/ava-device?deviceId=" + DEVICE, { auth: "Bearer wrong-token-value-xx" });
    const ok = await req("/api/internal/ava-device?deviceId=" + DEVICE);
    console.log(JSON.stringify({ none: none.status, bad: bad.status, ok: ok.status, body: redact(ok.json) }, null, 2));
    return;
  }
  if (step === "status") {
    const ok = await req("/api/internal/ava-device?deviceId=" + DEVICE);
    console.log(JSON.stringify(redact(ok.json), null, 2));
    return;
  }
  const cmd = step === "all" ? "DEVICE_STATUS" : step;
  const r = await command(cmd);
  console.log(JSON.stringify({ status: r.status, body: redact(r.json) }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "error");
  process.exit(1);
});
