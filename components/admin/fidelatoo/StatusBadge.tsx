import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  bad: "bg-red-50 text-red-800 border-red-200",
  idle: "bg-gray-50 text-gray-700 border-gray-200",
  info: "bg-sky-50 text-sky-800 border-sky-200",
};

export function StatusBadge({
  label,
  tone = "idle",
}: {
  label: string;
  tone?: keyof typeof tones;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone]
      )}
    >
      {label}
    </span>
  );
}

export function vmTone(status: string): keyof typeof tones {
  if (status === "online") return "ok";
  if (status === "starting") return "warn";
  if (status === "error") return "bad";
  return "idle";
}

export function appTone(status: string): keyof typeof tones {
  if (status === "open") return "ok";
  if (status === "installed") return "info";
  if (status === "update_required") return "warn";
  return "idle";
}

export function avaTone(status: string): keyof typeof tones {
  if (status === "collaborator_active") return "ok";
  if (status === "qr_ready" || status === "awaiting_scan" || status === "registration_in_progress") {
    return "warn";
  }
  if (status === "suspended" || status === "blocked" || status === "session_expired") return "bad";
  return "idle";
}

export const VM_LABELS: Record<string, string> = {
  online: "En ligne",
  stopped: "Arrêtée",
  starting: "Démarrage",
  error: "Erreur",
};

export const APP_LABELS: Record<string, string> = {
  installed: "Installée",
  open: "Ouverte",
  closed: "Fermée",
  update_required: "Mise à jour requise",
  unknown: "Inconnu",
};

export const AVA_LABELS: Record<string, string> = {
  not_configured: "Non configuré",
  registration_in_progress: "Inscription en cours",
  qr_ready: "QR prêt",
  awaiting_scan: "En attente du scan",
  collaborator_active: "Collaboratrice active",
  session_expired: "Session expirée",
  suspended: "Suspendue",
  blocked: "Bloquée",
};
