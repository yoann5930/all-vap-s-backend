import { PROMO_10ML_LABEL, PROMO_10ML_GROUP_SIZE, PROMO_10ML_FREE_PER_GROUP } from "@/lib/promotions/promo-10ml";

type TenMlOfferBannerProps = {
  compact?: boolean;
  className?: string;
};

export function TenMlOfferBanner({ compact = false, className = "" }: TenMlOfferBannerProps) {
  return (
    <section
      className={[
        "rounded-2xl border border-brand-500/25 bg-[#101720] px-4 py-4 sm:px-6 sm:py-5",
        className,
      ].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-400">
        {PROMO_10ML_LABEL}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">
        E-liquides 10 ml — {PROMO_10ML_GROUP_SIZE - PROMO_10ML_FREE_PER_GROUP}+
        {PROMO_10ML_FREE_PER_GROUP}
      </h2>
      <p className="mt-2 text-sm text-[#A7B0BC]">
        Pour {PROMO_10ML_GROUP_SIZE} flacons 10 ml éligibles, {PROMO_10ML_FREE_PER_GROUP} offert
        (le moins cher). Uniquement les e-liquides 10 ml — jamais 20 / 50 / 100 ml. Remise
        calculée au panier, prix catalogue inchangé.
      </p>
      {!compact ? (
        <p className="mt-3 text-xs text-[#A7B0BC]/80">
          A.V.A. vérifie cette offre sur votre panier avant le paiement.
        </p>
      ) : null}
    </section>
  );
}
