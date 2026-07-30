"use client";

import type { CatalogProductFull } from "@/lib/catalog/types";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

interface ProductDetailSectionsProps {
  product: CatalogProductFull;
  faq?: Array<{ q: string; a: string }>;
}

const DEFAULT_FAQ = [
  {
    q: "Quel taux de nicotine choisir ?",
    a: "Pour un vapoteur débutant, 6 à 12 mg/ml est souvent conseillé. Les vapoteurs confirmés préfèrent généralement 0 à 6 mg/ml. Nos équipes All Vap's vous orientent en boutique.",
  },
  {
    q: "Ce e-liquide convient-il à mon matériel ?",
    a: "Vérifiez le ratio PG/VG indiqué sur la fiche. Les ratios 50/50 conviennent aux pods et petites résistances ; les ratios plus VG aux clearomiseurs plus ouverts.",
  },
  {
    q: "Puis-je le tester en boutique ?",
    a: "Oui, dans nos bar à vape de Hautmont et Le Quesnoy, nos conseillers vous proposent un test avant achat.",
  },
];

export function ProductDetailSections({ product, faq = DEFAULT_FAQ }: ProductDetailSectionsProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

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
          {product.pgVg && <li>Ratio PG/VG : {product.pgVg}</li>}
          {product.format && <li>Format : {product.format}</li>}
          {product.nicotine != null && <li>Nicotine : {product.nicotine} mg/ml</li>}
          <li>Produit réservé aux adultes (+18 ans). Contient de la nicotine — substance addictive.</li>
          <li>Conservez hors de portée des enfants et des animaux.</li>
        </ul>
      </section>

      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="font-display text-xl font-semibold text-white">
          Questions fréquentes
        </h2>
        <div className="mt-4 divide-y divide-white/8 rounded-xl border border-white/8 bg-[#101720]">
          {faq.map((item, i) => (
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
