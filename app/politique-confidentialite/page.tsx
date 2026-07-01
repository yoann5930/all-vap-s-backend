import Link from "next/link";

export const metadata = {
  title: "Politique de confidentialité",
  description: "Politique de confidentialité et protection des données All Vap's.",
};

export default function PolitiqueConfidentialitePage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-vap-black">Politique de confidentialité</h1>
      <div className="mt-8 space-y-6 text-gray-600">
        <section>
          <h2 className="text-lg font-semibold text-vap-black">Collecte des données</h2>
          <p>
            All Vap&apos;s collecte les données nécessaires au traitement de vos commandes
            et à la gestion de votre compte client (nom, email, adresse).
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-vap-black">Utilisation des données</h2>
          <p>
            Vos données sont utilisées exclusivement pour le traitement de vos commandes,
            la livraison et le service client. Elles ne sont jamais vendues à des tiers.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-vap-black">Vos droits</h2>
          <p>
            Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification
            et de suppression de vos données. Contact : contact@allvaps.fr
          </p>
        </section>
      </div>
      <p className="mt-10 text-sm">
        <Link href="/" className="text-brand-700 hover:underline">← Retour à l&apos;accueil</Link>
      </p>
    </article>
  );
}
