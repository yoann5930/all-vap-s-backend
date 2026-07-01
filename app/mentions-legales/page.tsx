import Link from "next/link";

export const metadata = {
  title: "Mentions légales",
  description: "Mentions légales du site All Vap's.",
};

export default function MentionsLegalesPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-vap-black">Mentions légales</h1>
      <div className="prose prose-gray mt-8 max-w-none space-y-6 text-gray-600">
        <section>
          <h2 className="text-lg font-semibold text-vap-black">Éditeur du site</h2>
          <p>
            All Vap&apos;s<br />
            17 Avenue Marcel Aimé, 59330 Hautmont<br />
            Email : contact@allvaps.fr
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-vap-black">Hébergement</h2>
          <p>
            Ce site est hébergé par Render.com.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-vap-black">Propriété intellectuelle</h2>
          <p>
            L&apos;ensemble du contenu de ce site (textes, images, logos) est la propriété
            exclusive de All Vap&apos;s. Toute reproduction est interdite sans autorisation.
          </p>
        </section>
      </div>
      <p className="mt-10 text-sm">
        <Link href="/" className="text-brand-700 hover:underline">← Retour à l&apos;accueil</Link>
      </p>
    </article>
  );
}
