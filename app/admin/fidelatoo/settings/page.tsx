import { Card, CardBody } from "@/components/ui/Card";
import { getFidelatooPublicConfig, AVA_FIDELATOO_EMAIL } from "@/lib/fidelatoo/config";

export default function FidelatooSettingsPage() {
  const cfg = getFidelatooPublicConfig();

  return (
    <Card>
      <CardBody className="space-y-3 text-sm">
        <h2 className="text-base font-semibold">Réglages (lecture seule)</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gray-500">Orchestrateur activé</dt>
            <dd>{cfg.enabled ? "oui" : "non"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Configuré (URL + secret)</dt>
            <dd>{cfg.configured ? "oui" : "non"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Mode mock (tests)</dt>
            <dd>{cfg.mockEnabled ? "oui" : "non"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Email compte A.V.A.</dt>
            <dd>{cfg.avaEmail || AVA_FIDELATOO_EMAIL}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">TTL commande</dt>
            <dd>{cfg.commandTtlSec}s</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">TTL QR</dt>
            <dd>{cfg.qrTtlSec}s</dd>
          </div>
        </dl>
        <p className="text-xs text-gray-500">
          Variables serveur : FIDELATOO_ORCHESTRATOR_ENABLED, FIDELATOO_ORCHESTRATOR_URL,
          FIDELATOO_ORCHESTRATOR_SECRET, FIDELATOO_ORCHESTRATOR_MOCK (local uniquement),
          FIDELATOO_AVA_ACCOUNT_EMAIL. Aucun mot de passe dans ce panneau.
        </p>
      </CardBody>
    </Card>
  );
}
