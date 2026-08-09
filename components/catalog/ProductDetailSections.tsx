"use client";

import type { CatalogProductFull } from "@/lib/catalog/types";
import { getProductAdviceProfile } from "@/lib/catalog/product-advice-profile";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

interface ProductDetailSectionsProps {
  product: CatalogProductFull;
  faq?: Array<{ q: string; a: string }>;
}

export function ProductDetailSections({ product, faq }: ProductDetailSectionsProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const advice = useMemo(
    () =>
      getProductAdviceProfile({
        category: product.categorie,
        productType: product.format,
        format: product.format,
        name: product.nom,
        range: product.gamme,
        nicotineMg: product.nicotine,
      }),
    [product]
  );

  const faqItems = faq ?? advice.faq;

  const profil = product.profilGustatif ?? {
    fruit: false,
    menthole: false,
    boisson: false,
    dessert: false,
    tabac: false,
    bonbon: false,
    frais: false,
    tresFrais: false,
    sucre: false,
    acidule: false,
  };

  const profilLabels = [
    profil.fruit && "Fruité",
    profil.menthole && "Mentholé",
    profil.boisson && "Boisson",
    profil.dessert && "Gourmand",
    profil.tabac && "Tabac",
    profil.bonbon && "Bonbon",
    profil.frais && "Frais",
    profil.tresFrais && "Très frais",
    profil.sucre && "Sucré",
    profil.acidule && "Acidulé",
  ].filter(Boolean) as string[];

  const secondaires = product.saveursSecondaires ?? [];

  return (
    <div className="mt-12 space-y-10">
      {product.descriptionLongue && (
        <section aria-labelledby="desc-heading">
          <h2 id="desc-heading" className="font-display text-xl font-semibold text-white">
            Description
          </h2>
          <p className="mt-4 leading-relaxed text-[#A7B0BC]">{product.descriptionLongue}</p>
        </section>
      )}

      {profilLabels.length > 0 && (
        <section aria-labelledby="profil-heading">
          <h2 id="profil-heading" className="font-display text-xl font-semibold text-white">
            Profil gustatif
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {profilLabels.map((label) => (
              <span
                key={label}
                className="rounded-full border border-white/10 bg-[#101720] px-3 py-1 text-sm text-[#D5DBE4]"
              >
                {label}
              </span>
            ))}
          </div>
          {(product.saveurPrincipale || secondaires.length > 0) && (
            <p className="mt-4 text-sm text-[#A7B0BC]">
              {[product.saveurPrincipale, ...secondaires].filter(Boolean).join(" · ")}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="compat-heading">
        <h2 id="compat-heading" className="font-display text-xl font-semibold text-white">
          Compatibilités &amp; conseils
        </h2>
        <ul className="mt-4 space-y-2 text-sm text-[#A7B0BC]">
          {advice.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
          {product.pgVg && advice.kind !== "DIY_CONCENTRATE" && (
            <li>Ratio PG/VG : {product.pgVg}</li>
          )}
          {product.format && <li>Format : {product.format}</li>}
          {advice.showEliquidNicotineAdvice && product.nicotine != null && (
            <li>Nicotine : {product.nicotine} mg/ml</li>
          )}
          {advice.kind === "DIY_CONCENTRATE" && (
            <li>Nicotine : uniquement si vous ajoutez un booster / base nicotinée.</li>
          )}
          <li>Produit réservé aux adultes (+18 ans).</li>
          <li>Conservez hors de portée des enfants et des animaux.</li>
        </ul>
      </section>

      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="font-display text-xl font-semibold text-white">
          Questions fréquentes
        </h2>
        <div className="mt-4 divide-y divide-white/8 rounded-xl border border-white/8 bg-[#101720]">
          {faqItems.map((item, i) => (
            <div key={item.q}>
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-sm font-medium text-white"
                aria-expanded={openFaq === i}
              >
                {item.q}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[#A7B0BC] transition-transform ${openFaq === i ? "rotate-180" : ""}`}
                />
              </button>
              {openFaq === i && (
                <p className="px-4 pb-4 text-sm leading-relaxed text-[#A7B0BC]">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
