"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Mic, Settings } from "lucide-react";
import { useEffect } from "react";
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
  onPermissionGranted?: () => void;
}

export function MicPermissionPanel({
  status,
  isPrompting,
  showSettingsHelp,
  onActivateMic,
  onToggleSettingsHelp,
  onPermissionGranted,
}: MicPermissionPanelProps) {
  const browser = detectBrowser();
  const helpSteps = BROWSER_MIC_HELP[browser];

  const showDenied = status === "denied" && !isPrompting;
  const showPrompt = isPrompting || status === "prompting";
  const showUnsupported = status === "unsupported";
  const showModal = showDenied || showPrompt || showUnsupported;

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;

    let mounted = true;
    let permissionStatus: PermissionStatus | null = null;

    const handleChange = () => {
      if (!mounted || permissionStatus?.state !== "granted") return;
      onPermissionGranted?.();
    };

    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((result) => {
        permissionStatus = result;
        result.addEventListener("change", handleChange);
      })
      .catch(() => {});

    return () => {
      mounted = false;
      permissionStatus?.removeEventListener("change", handleChange);
    };
  }, [onPermissionGranted]);

  if (!showModal) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
        role="dialog"
        aria-label="Autorisation microphone"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="ava-mic-modal relative w-full max-w-md overflow-hidden rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-cyan-950/40 to-black/90 p-6 shadow-[0_0_60px_rgba(0,212,255,0.15)]"
        >
          <div className="ava-mic-modal-glow pointer-events-none absolute inset-0" aria-hidden />

          <div className="relative flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/10 shadow-[0_0_30px_rgba(0,212,255,0.25)]">
              <Mic className="h-6 w-6 text-cyan-300" strokeWidth={1.5} />
            </div>

            <h3 className="text-sm font-medium tracking-wide text-cyan-100/90">Accès au microphone</h3>

            {showUnsupported && (
              <p className="mt-3 text-[12px] leading-relaxed text-cyan-400/60">{MIC_MESSAGES.unsupported}</p>
            )}

            {showPrompt && !showUnsupported && (
              <p className="mt-3 text-[12px] leading-relaxed text-cyan-300/70">{MIC_MESSAGES.prompt}</p>
            )}

            {showDenied && (
              <>
                <p className="mt-3 text-[12px] leading-relaxed text-cyan-300/65">{MIC_MESSAGES.denied}</p>

                <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={onActivateMic}
                    className="rounded-full border border-cyan-400/40 bg-cyan-500/15 px-5 py-2 text-[12px] font-medium text-cyan-100 transition hover:border-cyan-300/55 hover:bg-cyan-500/25"
                  >
                    Activer le micro
                  </button>
                  <button
                    type="button"
                    onClick={onToggleSettingsHelp}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-cyan-700/40 px-5 py-2 text-[12px] text-cyan-400/70 transition hover:border-cyan-500/45 hover:text-cyan-300"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Paramètres navigateur
                  </button>
                </div>

                <AnimatePresence>
                  {showSettingsHelp && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 w-full overflow-hidden rounded-xl border border-cyan-800/35 bg-black/50 px-4 py-3 text-left"
                    >
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-cyan-400/55">
                        {browser === "safari"
                          ? "Safari"
                          : browser === "firefox"
                            ? "Firefox"
                            : browser === "edge"
                              ? "Chrome / Edge"
                              : "Navigateur"}
                      </p>
                      <ol className="space-y-1.5">
                        {helpSteps.map((step, i) => (
                          <li key={i} className="text-[11px] leading-relaxed text-cyan-500/60">
                            {i + 1}. {step}
                          </li>
                        ))}
                      </ol>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
