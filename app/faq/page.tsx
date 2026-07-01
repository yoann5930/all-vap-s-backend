import Link from "next/link";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { JsonLd } from "@/components/seo/JsonLd";
import { absoluteUrl, DEFAULT_DESCRIPTION, DEFAULT_TITLE } from "@/lib/seo/config";
import { faqSchema } from "@/lib/seo/schema";
import { SEO_FAQ } from "@/lib/seo/faq-content";

export const metadata = {
  title: "FAQ",
  description:
    "Questions fréquentes sur All Vap's : boutiques Hautmont et Le Quesnoy, e-liquides, livraison, conseils cigarette électronique.",
  alternates: { canonical: absoluteUrl("/faq") },
  openGraph: {
    title: `FAQ | ${DEFAULT_TITLE}`,
    description: DEFAULT_DESCRIPTION,
    url: absoluteUrl("/faq"),
  },
};

export default function FaqPage() {
  return (
    <>
      <JsonLd data={faqSchema(SEO_FAQ)} />
      <section className="bg-vap-black py-16 text-center sm:py-20">
        <h1 className="text-4xl font-bold text-white sm:text-5xl">Questions fréquentes</h1>
        <p className="mx-auto mt-4 max-w-2xl px-4 text-gray-400">
          Tout ce qu&apos;il faut savoir sur All Vap&apos;s, vos boutiques vape à Hautmont et Le Quesnoy.
        </p>
      </section>

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <Breadcrumb
          items={[
            { name: "Accueil", path: "/" },
            { name: "FAQ", path: "/faq" },
          ]}
        />

        <div className="space-y-6">
          {SEO_FAQ.map((item) => (
            <article key={item.question} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-vap-black">{item.question}</h2>
              <p className="mt-3 leading-relaxed text-gray-600">{item.answer}</p>
            </article>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-gray-500">
          Une autre question ?{" "}
          <Link href="/contact" className="font-medium text-brand-700 hover:underline">
            Contactez-nous
          </Link>
          {" · "}
          <Link href="/boutiques" className="font-medium text-brand-700 hover:underline">
            Nos boutiques
          </Link>
        </p>
      </div>
    </>
  );
}
