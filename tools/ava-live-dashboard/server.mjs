#!/usr/bin/env node
/**
 * AVA LIVE HEALTH DASHBOARD — outil local, hors site public.
 * Port 3856. SSE. Aucun secret.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.AVA_DASHBOARD_PORT || 3856);
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const STATE = path.join(DATA, "state.json");
const HISTORY = path.join(DATA, "history.jsonl");
const BASELINE = path.join(ROOT, "baseline.json");
const PUBLIC = path.join(ROOT, "public");

fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(STATE)) {
  fs.copyFileSync(BASELINE, STATE);
}

const clients = new Set();

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  }
}

function writeState(next) {
  const prev = readState();
  if (typeof next.score === "number" && next.score !== prev.score) {
    fs.appendFileSync(
      HISTORY,
      JSON.stringify({
        at: new Date().toISOString(),
        from: prev.score,
        to: next.score,
        phase: next.currentPhase,
        reason: next.currentTask,
        testsPassed: next.testsPassed,
        testsTotal: next.testsTotal,
      }) + "\n",
    );
  }
  fs.writeFileSync(STATE, JSON.stringify(next, null, 2));
  broadcast();
}

function mergeState(patch) {
  const cur = readState();
  const next = deepMerge(cur, patch);
  if (Array.isArray(patch.activity)) {
    next.activity = [...(cur.activity || []), ...patch.activity].slice(-80);
  }
  writeState(next);
  return next;
}

function deepMerge(a, b) {
  if (Array.isArray(b)) return b;
  if (b && typeof b === "object") {
    const out = { ...(a || {}) };
    for (const k of Object.keys(b)) out[k] = deepMerge(a ? a[k] : undefined, b[k]);
    return out;
  }
  return b;
}

function broadcast() {
  const payload = `data: ${JSON.stringify(readState())}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

fs.watch(DATA, { persistent: true }, (event, file) => {
  if (file === "state.json") broadcast();
});

function mime(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/api/state") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(readState()));
    return;
  }

  if (url.pathname === "/api/history") {
    const lines = fs.existsSync(HISTORY)
      ? fs.readFileSync(HISTORY, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
      : [];
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(lines));
    return;
  }

  if (url.pathname === "/api/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify(readState())}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (url.pathname === "/api/report" && req.method === "POST") {
    const ip = req.socket.remoteAddress || "";
    if (!ip.includes("127.0.0.1") && ip !== "::1" && ip !== ":ffff:127.0.0.1") {
      res.writeHead(403);
      res.end("local only");
      return;
    }
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 2_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        const patch = JSON.parse(body);
        const next = mergeState(patch);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, score: next.score }));
      } catch (e) {
        res.writeHead(400);
        res.end(String(e));
      }
    });
    return;
  }

  let file = url.pathname === "/" ? "/index.html" : url.pathname;
  const abs = path.join(PUBLIC, path.normalize(file).replace(/^[/\\]+/, ""));
  if (!abs.startsWith(PUBLIC) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": mime(abs), "Cache-Control": "no-store" });
  fs.createReadStream(abs).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`AVA LIVE HEALTH DASHBOARD ${url}`);
  const open =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(open, () => {});
});
