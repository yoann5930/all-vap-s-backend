import { PROMO_10ML_LABEL, tenMlTiersForDisplay } from "@/lib/promotions/promo-10ml";

type TenMlOfferBannerProps = {
  compact?: boolean;
  className?: string;
};

export function TenMlOfferBanner({ compact = false, className = "" }: TenMlOfferBannerProps) {
  const tiers = tenMlTiersForDisplay();
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
        E-liquides 10 ml — plus vous en prenez, moins c’est cher
      </h2>
      <p className="mt-2 text-sm text-[#A7B0BC]">
        Prix catalogue souvent 6,90 € / flacon. Remise calculée au panier, toutes saveurs 10 ml
        cumulées. À partir de 5 flacons, des 10 ml sont offerts en plus (5+1 jusqu’à 10+6).
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[280px] text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[#A7B0BC]">
              <th className="pb-2 pr-3 font-medium">Qté</th>
              <th className="pb-2 pr-3 font-medium">Prix / unité</th>
              <th className="pb-2 font-medium">Offert</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.qty} className="border-t border-white/8 text-[#F5F7FA]">
                <td className="py-1.5 pr-3">{t.qty}</td>
                <td className="py-1.5 pr-3">{t.unitLabel}</td>
                <td className="py-1.5 text-brand-300">{t.extraLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact ? (
        <p className="mt-3 text-xs text-[#A7B0BC]/80">
          A.V.A. vérifie cette offre sur votre panier avant le paiement. Uniquement les
          e-liquides 10 ml — jamais 20 / 50 / 100 ml. Ce n’est pas l’offre Twenty.
        </p>
      ) : null}
    </section>
  );
}
