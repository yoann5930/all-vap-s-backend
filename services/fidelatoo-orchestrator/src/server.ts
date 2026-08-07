import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRequestAuth } from "./auth.js";
import { healthPayload, runCommand } from "./commands.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));
// Secret optionnel depuis coffre local hors service/
loadEnvFile(path.resolve(__dirname, "..", "..", "..", ".local", "fidelatoo", "orchestrator.env"));

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
  res.end(body);
}

const secret = (process.env.FIDELATOO_ORCHESTRATOR_SECRET || "").trim();
if (!secret || secret.length < 32) {
  console.error(
    "[orchestrator] FIDELATOO_ORCHESTRATOR_SECRET manquant ou trop court (>=32). Refuse de démarrer."
  );
  process.exit(1);
}

const host = (process.env.HOST || "127.0.0.1").trim();
const port = Number(process.env.PORT || 8787) || 8787;
const maxSkew = Math.min(Math.max(Number(process.env.COMMAND_MAX_SKEW_SEC || 90) || 90, 30), 300);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/v1/health")) {
    return sendJson(res, 200, healthPayload());
  }

  if (req.method === "POST" && url.pathname === "/v1/command") {
    try {
      const body = await readBody(req);
      const timestamp = String(req.headers["x-allvaps-timestamp"] || "");
      const nonce = String(req.headers["x-allvaps-nonce"] || "");
      const signature = String(req.headers["x-allvaps-signature"] || "");
      const actionHeader = String(req.headers["x-allvaps-action-id"] || "");

      const auth = assertRequestAuth({
        secret,
        body,
        timestamp,
        nonce,
        signature,
        maxSkewSec: maxSkew,
      });
      if (!auth.ok) {
        return sendJson(res, 401, { ok: false, message: auth.message });
      }

      let parsed: {
        actionId?: string;
        command?: string;
        store?: "HAUTMONT" | "LE_QUESNOY";
        allow?: boolean;
        expiresAt?: number;
      };
      try {
        parsed = JSON.parse(body);
      } catch {
        return sendJson(res, 400, { ok: false, message: "JSON invalide" });
      }

      if (parsed.expiresAt && Number(parsed.expiresAt) * 1000 < Date.now()) {
        return sendJson(res, 401, { ok: false, message: "Commande expirée" });
      }

      const command = String(parsed.command || "");
      const result = runCommand(command, {
        store: parsed.store,
        allow: parsed.allow,
        actionId: parsed.actionId || actionHeader || undefined,
      });

      // Ne jamais logger qrImageBase64
      console.log(
        `[orchestrator] ${result.command} ok=${result.ok} actionId=${result.actionId} msg=${(result.message || "").slice(0, 120)}`
      );

      return sendJson(res, result.ok ? 200 : 502, result);
    } catch (err) {
      return sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : "Erreur interne",
      });
    }
  }

  return sendJson(res, 404, { ok: false, message: "Not found" });
});

server.listen(port, host, () => {
  console.log(
    `[orchestrator] listening http://${host}:${port} mock=false health=/health command=/v1/command`
  );
  console.log(
    "[orchestrator] Bind local only by default. Expose via tunnel HTTPS privé (Cloudflare) — jamais ADB public."
  );
});
