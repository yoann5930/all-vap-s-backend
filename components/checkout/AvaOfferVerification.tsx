"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import type { PromoTwentyResult } from "@/lib/promotions/promo-twenty";
import type { Promo10mlResult } from "@/lib/promotions/promo-10ml";

type AvaOfferVerificationProps = {
  items: Array<{
    productId: string;
    variantId?: string | null;
    quantity: number;
  }>;
  clientTwenty: PromoTwentyResult;
  clientPromo10?: Promo10mlResult;
  clientTotalCents: number;
};

export function AvaOfferVerification({
  items,
  clientTwenty,
  clientPromo10,
  clientTotalCents,
}: AvaOfferVerificationProps) {
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(true);

  const itemsKey = items
    .map((i) => `${i.productId}:${i.variantId || ""}:${i.quantity}`)
    .join("|");
  const fallbackMessage = [clientPromo10?.avaSummary, clientTwenty.avaSummary]
    .filter((s) => s && !/aucun /i.test(s))
    .join(" ") || clientTwenty.avaSummary;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ava/verify-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && typeof data.avaMessage === "string") {
          setServerMessage(data.avaMessage);
          setOk(data.ok !== false);
        } else {
          setServerMessage(fallbackMessage);
        }
      } catch {
        if (!cancelled) setServerMessage(fallbackMessage);
      }
    })();
    return () => {
      cancelled = true;
    };
    // itemsKey évite une boucle si le parent recrée le tableau
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, clientTwenty.avaSummary, clientPromo10?.avaSummary]);

  const message = serverMessage || fallbackMessage;

  return (
    <div
      className={[
        "rounded-xl border px-4 py-3 text-sm",
        ok
          ? "border-brand-500/30 bg-brand-500/10 text-brand-100"
          : "border-amber-500/40 bg-amber-500/10 text-amber-100",
      ].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400">
        A.V.A. — vérification avant paiement
      </p>
      <p className="mt-1 leading-relaxed">{message}</p>
      {clientPromo10 && clientPromo10.eligibleQuantity > 0 ? (
        <p className="mt-2 text-xs text-[#A7B0BC]">
          {clientPromo10.eligibleQuantity} One Taste 10 ml ·{" "}
          {clientPromo10.unitCents != null ? formatPrice(clientPromo10.unitCents) : "—"} / unité
          {clientPromo10.freeExtra > 0
            ? ` · + ${clientPromo10.freeExtra} offert${clientPromo10.freeExtra > 1 ? "s" : ""}`
            : ""}
        </p>
      ) : null}
      {clientTwenty.eligibleQuantity > 0 ? (
        <p className="mt-2 text-xs text-[#A7B0BC]">
          {clientTwenty.eligibleQuantity} Twenty ·{" "}
          {clientTwenty.unitCents != null ? formatPrice(clientTwenty.unitCents) : "—"} / unité
          {clientTwenty.freeExtra > 0
            ? ` · + ${clientTwenty.freeExtra} offert${clientTwenty.freeExtra > 1 ? "s" : ""}`
            : ""}{" "}
          · articles {formatPrice(clientTotalCents)}
        </p>
      ) : clientPromo10 && clientPromo10.eligibleQuantity > 0 ? (
        <p className="mt-2 text-xs text-[#A7B0BC]">
          articles {formatPrice(clientTotalCents)}
        </p>
      ) : null}
    </div>
  );
}
