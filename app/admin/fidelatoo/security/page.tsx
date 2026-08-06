import { Card, CardBody } from "@/components/ui/Card";

export default function FidelatooSecurityPage() {
  return (
    <Card>
      <CardBody className="space-y-3 text-sm text-gray-700">
        <h2 className="text-base font-semibold text-gray-900">Sécurité du connecteur</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>HTTPS obligatoire vers l&apos;orchestrateur privé</li>
          <li>Authentification serveur à serveur (HMAC + nonce + timestamp)</li>
          <li>Jetons / commandes à durée limitée</li>
          <li>Liste blanche d&apos;origines (CSRF) + rate limit</li>
          <li>Journal d&apos;audit (sans QR ni secrets)</li>
          <li>Identifiant unique par action + anti-rejeu</li>
          <li>Rôle ADMIN obligatoire — le navigateur ne parle jamais à ADB</li>
          <li>Whitelist stricte des commandes — aucune commande arbitraire</li>
          <li>Mot de passe A.V.A. hors dépôt, hors frontend, hors NEXT_PUBLIC</li>
        </ul>
        <p>
          Interdit : API Fidelatoo publique, exposition ADB/Appium/scrcpy/VM sur Internet,
          publication du QR, rôle administratrice pour A.V.A.
        </p>
      </CardBody>
    </Card>
  );
}
