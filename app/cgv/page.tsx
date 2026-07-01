import Link from "next/link";

export const metadata = {
  title: "CGV",
  description: "Conditions Générales de Vente All Vap's.",
};

export default function CgvPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-vap-black">Conditions Générales de Vente</h1>
      <div className="mt-8 space-y-6 text-gray-600">
        <section>
          <h2 className="text-lg font-semibold text-vap-black">Article 1 — Objet</h2>
          <p>
            Les présentes CGV régissent les ventes de produits effectuées sur le site
            All Vap&apos;s, réservées aux personnes majeures.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-vap-black">Article 2 — Prix</h2>
          <p>
            Les prix sont indiqués en euros TTC. All Vap&apos;s se réserve le droit de
            modifier ses prix à tout moment.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-vap-black">Article 3 — Paiement</h2>
          <p>
            Le paiement s&apos;effectue de manière sécurisée via Viva.com. La commande
            est validée après confirmation du paiement.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-vap-black">Article 4 — Livraison</h2>
          <p>
            Les délais de livraison sont de 24 à 48 h ouvrées en France métropolitaine,
            sous réserve de disponibilité des produits.
          </p>
        </section>
      </div>
      <p className="mt-10 text-sm">
        <Link href="/" className="text-brand-700 hover:underline">← Retour à l&apos;accueil</Link>
      </p>
    </article>
  );
}
