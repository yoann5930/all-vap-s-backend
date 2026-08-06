import { requireAuth } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/Card";
import {
  isCarrierConfigured,
  type CarrierId,
} from "@/lib/shipping/carriers";

export const dynamic = "force-dynamic";

const carriers: { id: CarrierId; name: string; env: string }[] = [
  { id: "mondial-relay", name: "Mondial Relay", env: "MONDIAL_RELAY_API_KEY" },
  { id: "relais-colis", name: "Relais Colis", env: "RELAIS_COLIS_API_KEY" },
  { id: "colissimo", name: "La Poste / Colissimo", env: "COLISSIMO_API_KEY" },
];

export default async function AdminCarriersPage() {
  try {
    await requireAuth("ADMIN");
  } catch {
    redirect("/login?redirect=/admin/transporteurs");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Transporteurs</h1>
      <p className="text-sm text-gray-500">
        Architecture prête. Sans clé API : saisie manuelle du n° de suivi — aucun tracking inventé.
      </p>
      {carriers.map((c) => (
        <Card key={c.id}>
          <CardBody>
            <p className="font-semibold">{c.name}</p>
            <p className="mt-1 text-sm text-gray-600">
              Variable : <code>{c.env}</code> —{" "}
              {isCarrierConfigured(c.id) ? "clé détectée" : "non configurée"}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Création d&apos;expédition, étiquette PDF et suivi auto : à brancher sur l&apos;API
              officielle dès réception des accès.
            </p>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
