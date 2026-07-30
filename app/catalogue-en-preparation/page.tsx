import Link from "next/link";
import { absoluteUrl } from "@/lib/seo/config";

export const metadata = {
  title: "Catalogue en préparation",
  robots: { index: false, follow: false },
  alternates: { canonical: absoluteUrl("/catalogue-en-preparation") },
};

/** Catégories non validées — masquées du public */
export default function CatalogueEnPreparationPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
        All Vap&apos;s
      </p>
      <h1 className="mt-3 font-display text-3xl text-white">
        Section en préparation
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[#A7B0BC]">
        Cette famille de produits n&apos;est pas encore publiée. Nous reconstruisons
        le catalogue référence par référence — sans données inventées.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/e-liquides"
          className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-premium-black"
        >
          E-liquides
        </Link>
        <Link
          href="/boutiques"
          className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white"
        >
          Nos boutiques
        </Link>
      </div>
    </div>
  );
}
