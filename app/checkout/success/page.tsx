"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const [status, setStatus] = useState<string>("PENDING");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    async function checkPayment() {
      try {
        const res = await fetch(`/api/sumup/webhook?orderId=${orderId}`);
        const data = await res.json();
        setStatus(data.status || "PENDING");
      } catch {
        setStatus("PENDING");
      } finally {
        setLoading(false);
      }
    }

    checkPayment();
  }, [orderId]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      {loading ? (
        <Loader2 className="mx-auto h-16 w-16 animate-spin text-brand-600" />
      ) : (
        <CheckCircle className="mx-auto h-16 w-16 text-brand-600" />
      )}

      <h1 className="mt-6 text-3xl font-bold text-gray-900">
        {status === "PAID" ? "Commande confirmée !" : "Commande enregistrée"}
      </h1>

      <p className="mt-4 text-gray-600">
        {status === "PAID"
          ? "Merci pour votre achat. Vous recevrez un email de confirmation sous peu."
          : "Votre commande a été enregistrée. Le paiement sera confirmé une fois traité par SumUp."}
      </p>

      {orderId && (
        <p className="mt-2 text-sm text-gray-500">
          Référence : {orderId.slice(-8).toUpperCase()}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button href="/boutique">Continuer mes achats</Button>
        <Button href="/account" variant="outline">Mes commandes</Button>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center">Chargement...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
