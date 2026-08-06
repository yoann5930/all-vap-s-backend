"use client";

import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function FidelatooQrPage() {
  return (
    <Card>
      <CardBody className="space-y-3">
        <h2 className="font-semibold">QR code collaboratrice</h2>
        <p className="text-sm text-gray-600">
          Le QR A.V.A. n&apos;est affiché que sur{" "}
          <code className="text-xs">/admin/fidelatoo/ava</code>, derrière session ADMIN, durée limitée,
          masqué par défaut, supprimé après scan.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>Cache-Control: no-store</li>
          <li>X-Robots-Tag: noindex, nofollow</li>
          <li>Aucune URL publique</li>
          <li>Jamais enregistré dans les logs</li>
        </ul>
        <Button href="/admin/fidelatoo/ava" size="sm">
          Aller au panneau A.V.A.
        </Button>
        <p className="text-xs text-gray-500">
          <Link href="/admin/fidelatoo/ava" className="text-brand-700 hover:underline">
            Afficher / confirmer le QR
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
