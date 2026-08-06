"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";

declare global {
  interface Window {
    SumUpCard?: {
      mount: (options: {
        id: string;
        checkoutId: string;
        onResponse: (type: string, body: unknown) => void;
        locale?: string;
      }) => { unmount?: () => void };
    };
  }
}

function SecurePayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const checkoutId = searchParams.get("checkoutId");
  const [error, setError] = useState("");
  const [loadingWidget, setLoadingWidget] = useState(true);
  const mountedRef = useRef<{ unmount?: () => void } | null>(null);

  useEffect(() => {
    if (!orderId || !checkoutId) {
      setError("Paramètres de paiement manquants.");
      setLoadingWidget(false);
      return;
    }

    let cancelled = false;

    async function loadWidget() {
      try {
        if (!window.SumUpCard) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js";
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () =>
              reject(new Error("Le service de paiement est temporairement indisponible."));
            document.body.appendChild(script);
          });
        }

        if (cancelled || !window.SumUpCard) return;

        mountedRef.current = window.SumUpCard.mount({
          id: "secure-card-form",
          checkoutId: checkoutId!,
          locale: "fr-FR",
          onResponse: (type) => {
            if (type === "success" || type === "sent") {
              router.replace(`/checkout/success?orderId=${encodeURIComponent(orderId!)}`);
              return;
            }
            if (type === "error" || type === "fail") {
              setError(
                "Le paiement n'a pas pu être finalisé. Vérifiez vos informations puis réessayez. Aucun montant n'a été débité."
              );
            }
          },
        });
        setLoadingWidget(false);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Le service de paiement est temporairement indisponible. Aucun montant n'a été débité."
        );
        setLoadingWidget(false);
      }
    }

    loadWidget();

    return () => {
      cancelled = true;
      mountedRef.current?.unmount?.();
    };
  }, [orderId, checkoutId, router]);

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold text-white">Paiement sécurisé</h1>
      <p className="mt-2 text-sm text-[#A7B0BC]">
        Saisissez vos informations bancaires pour confirmer le paiement. Aucune donnée de
        carte n&apos;est stockée sur All Vap&apos;s.
      </p>

      <Card className="mt-6">
        <CardBody>
          {loadingWidget && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#A7B0BC]">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement du formulaire de paiement…
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          <div id="secure-card-form" className="min-h-[120px]" />
        </CardBody>
      </Card>
    </div>
  );
}

export default function CheckoutPayPage() {
  return (
    <Suspense
      fallback={<div className="py-16 text-center text-[#A7B0BC]">Chargement du paiement…</div>}
    >
      <SecurePayContent />
    </Suspense>
  );
}
