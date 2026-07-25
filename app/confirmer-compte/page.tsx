"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

export default function ConfirmerComptePage() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("error");
      setMessage("Lien de confirmation invalide.");
      return;
    }

    fetch(`/api/auth/confirm?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setStatus("error");
          setMessage(data.error || "Confirmation impossible.");
          return;
        }
        setStatus("ok");
        setMessage(data.message || "Compte confirmé.");
      })
      .catch(() => {
        setStatus("error");
        setMessage("Erreur réseau.");
      });
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <CardBody>
          <h1 className="text-xl font-semibold">Confirmation du compte</h1>
          {status === "loading" && <p className="mt-3 text-sm text-gray-500">Validation en cours…</p>}
          {status === "ok" && (
            <>
              <p className="mt-3 text-sm text-green-700">{message}</p>
              <Button href="/login" className="mt-4">
                Se connecter
              </Button>
            </>
          )}
          {status === "error" && (
            <>
              <p className="mt-3 text-sm text-red-600">{message}</p>
              <Link href="/" className="mt-4 inline-block text-sm underline">
                Retour à l’accueil
              </Link>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
