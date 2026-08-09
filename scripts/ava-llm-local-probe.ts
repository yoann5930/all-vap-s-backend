/**
 * Probe matériel + Ollama pour A.V.A. Admin (PC fixe / poste local).
 * Aucun téléchargement de modèle — reco seulement.
 *
 * Usage: npx tsx scripts/ava-llm-local-probe.ts
 */
import { execSync } from "child_process";
import os from "os";
import {
  DEFAULT_OLLAMA_MODEL,
  getOllamaBaseUrl,
  getOllamaModel,
  probeAvaLlmProviders,
  chatWithAvaLlm,
  scrubSecretsForLlm,
} from "@/lib/ai/providers";

type Reco = {
  model: string;
  reason: string;
  ramGbNeeded: number;
  alreadyInstalled: boolean;
};

function totalRamGb(): number {
  return Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10;
}

function freeRamGb(): number {
  return Math.round((os.freemem() / (1024 ** 3)) * 10) / 10;
}

function listOllamaModels(): string[] {
  try {
    const out = execSync("ollama list", { encoding: "utf8", timeout: 8000 });
    return out
      .split(/\r?\n/)
      .slice(1)
      .map((l) => l.trim().split(/\s+/)[0])
      .filter(Boolean);
  } catch {
    return [];
  }
}

function recommend(installed: string[], ramGb: number): Reco {
  const prefer = [
    { model: "qwen2.5:7b", ram: 8, reason: "FR + admin conversation, déjà courant Ollama (~4.7 Go)" },
    { model: "llama3.1:8b", ram: 10, reason: "Bon français, contexte correct (~4.9 Go)" },
    { model: "qwen2.5:3b", ram: 5, reason: "Léger CPU-only si RAM ≤ 8 Go" },
    { model: "phi3:mini", ram: 4, reason: "Ultra-léger secours (qualité FR moindre)" },
  ];
  for (const p of prefer) {
    if (ramGb >= p.ram && installed.some((m) => m === p.model || m.startsWith(p.model.split(":")[0]))) {
      const hit = installed.find((m) => m === p.model || m.startsWith(p.model.split(":")[0] + ":")) || p.model;
      return {
        model: hit,
        reason: p.reason + " (déjà installé)",
        ramGbNeeded: p.ram,
        alreadyInstalled: true,
      };
    }
  }
  for (const p of prefer) {
    if (ramGb >= p.ram) {
      return {
        model: p.model,
        reason: p.reason + " — à puller : ollama pull " + p.model,
        ramGbNeeded: p.ram,
        alreadyInstalled: false,
      };
    }
  }
  return {
    model: "phi3:mini",
    reason: "RAM trop basse pour 7B — phi3:mini uniquement",
    ramGbNeeded: 4,
    alreadyInstalled: installed.includes("phi3:mini"),
  };
}

async function main() {
  const ram = totalRamGb();
  const free = freeRamGb();
  const cpus = os.cpus();
  const installed = listOllamaModels();
  const reco = recommend(installed, ram);
  const providers = await probeAvaLlmProviders();

  console.log("=== A.V.A. local LLM probe ===");
  console.log("OS:", os.platform(), os.arch(), os.release());
  console.log("CPU:", cpus[0]?.model || "?", "cores=", cpus.length);
  console.log("RAM_GB total=", ram, "free=", free);
  console.log("GPU: non requis (CPU-only OK)");
  console.log("Ollama URL:", getOllamaBaseUrl());
  console.log("Configured model:", getOllamaModel(), "(default", DEFAULT_OLLAMA_MODEL + ")");
  console.log("Installed models:", installed.join(", ") || "(none)");
  console.log("Recommended:", reco.model, "| RAM≥", reco.ramGbNeeded, "Go |", reco.reason);
  console.log("Providers:", JSON.stringify(providers));

  const scrubbed = scrubSecretsForLlm("password=secret123 OPENAI_API_KEY=sk-abc123456789 token=eyJhbGciOi.xx.yy");
  console.log("Secret scrub sample OK:", !/sk-abc|secret123|eyJhbGci/.test(scrubbed));

  process.env.AVA_LLM_PROVIDER = "local";
  // Ne pas utiliser OpenAI pour ce test
  const prevKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  if (!providers.local.reachable) {
    console.log("LOCAL_REACHABLE: NO — démarre Ollama (ollama serve)");
    process.exitCode = 2;
  } else {
    // Force recommended model for ping if configured missing
    if (!installed.includes(getOllamaModel()) && reco.alreadyInstalled) {
      process.env.AVA_OLLAMA_MODEL = reco.model;
    }
    const t0 = Date.now();
    const chat = await chatWithAvaLlm({
      messages: [
        {
          role: "system",
          content:
            "Tu es A.V.A., collègue Admin All Vap's. Réponds en français, une phrase courte.",
        },
        {
          role: "user",
          content: "Sans menu : confirme en une phrase que tu tournes en local.",
        },
      ],
      maxTokens: 80,
      temperature: 0.4,
      preferShort: true,
      logTag: "ava-local-probe",
    });
    console.log("LOCAL_CHAT ok=", chat.ok, "provider=", chat.provider, "model=", chat.model);
    console.log("LOCAL_CHAT kind=", chat.kind, "latencyMs=", chat.latencyMs, "wallMs=", Date.now() - t0);
    console.log("LOCAL_CHAT text=", (chat.text || "").slice(0, 220));
    process.exitCode = chat.ok ? 0 : 3;
  }

  if (prevKey) process.env.OPENAI_API_KEY = prevKey;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
