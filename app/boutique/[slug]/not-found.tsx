import Link from "next/link";

export default function BoutiqueProductNotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="font-display text-4xl text-white">Produit introuvable</h1>
      <p className="mt-3 text-sm text-[#A7B0BC]">
        Cette fiche n&apos;existe pas, n&apos;est plus publiée, ou l&apos;adresse (slug) est
        incorrecte.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/e-liquides"
          className="inline-flex rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-premium-black"
        >
          Voir les e-liquides
        </Link>
        <Link
          href="/formats/20ml"
          className="inline-flex rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Formats 20 ml
        </Link>
      </div>
    </div>
  );
}
