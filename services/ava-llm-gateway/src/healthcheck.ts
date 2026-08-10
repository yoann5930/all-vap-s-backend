import { loadConfig } from "./config.js";
import { probeOllama } from "./ollama.js";

async function main() {
  const cfg = loadConfig();
  const ollama = await probeOllama(cfg.ollamaBaseUrl);
  let gateway = false;
  try {
    const res = await fetch(`http://${cfg.host}:${cfg.port}/health`);
    gateway = res.ok;
    const j = (await res.json()) as { ok?: boolean };
    gateway = Boolean(j.ok);
  } catch {
    gateway = false;
  }
  console.log(
    JSON.stringify({
      ollama,
      gateway,
      host: cfg.host,
      port: cfg.port,
      primaryModel: cfg.primaryModel,
    })
  );
  process.exit(ollama && gateway ? 0 : 1);
}

main();
