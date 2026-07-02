"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  BROWSER_MIC_HELP,
  detectBrowser,
  MIC_MESSAGES,
  type MicPermissionStatus,
} from "@/lib/ai/mic-permission";

interface MicPermissionPanelProps {
  status: MicPermissionStatus;
  isPrompting: boolean;
  showSettingsHelp: boolean;
  onActivateMic: () => void;
  onToggleSettingsHelp: () => void;
  onDismissHelp?: () => void;
}

export function MicPermissionPanel({
  status,
  isPrompting,
  showSettingsHelp,
  onActivateMic,
  onToggleSettingsHelp,
}: MicPermissionPanelProps) {
  const browser = detectBrowser();
  const helpSteps = BROWSER_MIC_HELP[browser];

  const showDenied = status === "denied" && !isPrompting;
  const showPrompt = isPrompting || status === "prompting";
  const showUnsupported = status === "unsupported";

  if (!showDenied && !showPrompt && !showUnsupported) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="mx-auto max-w-sm px-4 text-center"
      >
        {showUnsupported && (
          <p className="text-[11px] leading-relaxed text-cyan-500/50">{MIC_MESSAGES.unsupported}</p>
        )}

        {showPrompt && !showUnsupported && (
          <p className="text-[11px] leading-relaxed text-cyan-400/55">{MIC_MESSAGES.prompt}</p>
        )}

        {showDenied && (
          <>
            <p className="text-[11px] leading-relaxed text-amber-500/65">{MIC_MESSAGES.denied}</p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onActivateMic}
                className="rounded-full border border-cyan-500/35 bg-cyan-950/40 px-4 py-1.5 text-[11px] text-cyan-300/80 transition hover:border-cyan-400/50 hover:bg-cyan-900/30"
              >
                Activer le micro
              </button>
              <button
                type="button"
                onClick={onToggleSettingsHelp}
                className="rounded-full border border-cyan-800/40 px-4 py-1.5 text-[11px] text-cyan-500/50 transition hover:border-cyan-600/40 hover:text-cyan-400/70"
              >
                Ouvrir les paramètres du navigateur
              </button>
            </div>

            <AnimatePresence>
              {showSettingsHelp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 overflow-hidden rounded-lg border border-cyan-900/40 bg-black/60 px-3 py-2.5 text-left"
                >
                  <p className="mb-2 text-[10px] font-medium text-cyan-400/60">
                    {browser === "safari"
                      ? "Safari"
                      : browser === "firefox"
                        ? "Firefox"
                        : browser === "edge"
                          ? "Chrome / Edge"
                          : "Navigateur"}
                  </p>
                  <ol className="space-y-1">
                    {helpSteps.map((step, i) => (
                      <li key={i} className="text-[10px] leading-relaxed text-cyan-600/55">
                        {i + 1}. {step}
                      </li>
                    ))}
                  </ol>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
