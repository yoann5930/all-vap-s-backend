import Link from "next/link";
import Image from "next/image";
import { MapPin, Phone, Clock, Navigation, Mail, ArrowRight } from "lucide-react";
import { stores } from "@/lib/stores";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { JsonLd } from "@/components/seo/JsonLd";
import { absoluteUrl, DEFAULT_DESCRIPTION } from "@/lib/seo/config";
import { localBusinessSchema } from "@/lib/seo/schema";

export const metadata = {
  title: "Nos boutiques",
  description:
    "All Vap's Hautmont et All Vap's Le Quesnoy — boutiques cigarette électronique premium dans le Nord. Adresses, horaires, itinéraire et avis Google.",
  alternates: { canonical: absoluteUrl("/boutiques") },
  openGraph: {
    title: "Nos boutiques | All Vap's",
    description: DEFAULT_DESCRIPTION,
    url: absoluteUrl("/boutiques"),
  },
};

export default function BoutiquesPage() {
  return (
    <>
      <JsonLd data={stores.map((s) => localBusinessSchema(s))} />
      <section className="bg-vap-black py-16 text-center sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-400">Près de chez vous</p>
        <h1 className="mt-4 text-4xl font-bold text-white sm:text-5xl">Nos boutiques</h1>
        <p className="mx-auto mt-4 max-w-2xl px-4 text-gray-400">
          Retrouvez l&apos;univers All Vap&apos;s dans nos deux magasins du Nord.
          Conseils experts, large choix et accueil premium.
        </p>
      </section>

      <div className="mx-auto max-w-7xl space-y-20 px-4 py-16 sm:px-6 lg:px-8">
        <Breadcrumb
          items={[
            { name: "Accueil", path: "/" },
            { name: "Nos boutiques", path: "/boutiques" },
          ]}
        />

        {stores.map((store) => (
          <article key={store.id} className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <div>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-vap-black">
                <MapPin className="h-6 w-6 text-brand-400" />
              </div>
              <h2 className="text-2xl font-bold text-vap-black sm:text-3xl">{store.name.toUpperCase()}</h2>
              <address className="mt-4 not-italic text-lg text-gray-600">
                {store.address}<br />
                {store.postalCode} {store.city}
              </address>

              <div className="mt-6 flex flex-wrap gap-3">
                <a href={store.mapsUrl} target="_blank" rel="noopener noreferrer">
                  <Button className="gap-2"><Navigation className="h-4 w-4" />Itinéraire</Button>
                </a>
                <a href={`tel:${store.phone}`}>
                  <Button variant="outline" className="gap-2"><Phone className="h-4 w-4" />Appeler</Button>
                </a>
                <a href={`mailto:${store.email}`}>
                  <Button variant="wood" className="gap-2"><Mail className="h-4 w-4" />Email</Button>
                </a>
                <Button href={`/boutiques/${store.id}`} variant="outline" className="gap-2">
                  Fiche boutique
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              <Card className="mt-6">
                <CardBody>
                  <div className="flex items-center gap-2 text-sm font-semibold text-vap-black">
                    <Clock className="h-4 w-4 text-brand-600" />
                    Horaires d&apos;ouverture
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-gray-600">
                    {store.hours.map((h) => <li key={h}>{h}</li>)}
                  </ul>
                </CardBody>
              </Card>

              <div className="mt-6 grid grid-cols-3 gap-2">
                {store.photos.map((photo, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
                    <Image src={photo} alt={`${store.name} photo ${i + 1}`} fill className="object-cover" sizes="200px" loading="lazy" />
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-lg">
              <iframe
                src={store.embedMapUrl}
                width="100%"
                height="450"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title={`Carte ${store.name}`}
                className="w-full"
              />
            </div>
          </article>
        ))}
      </div>

      <p className="pb-12 text-center">
        <Link href="/" className="text-sm text-brand-700 hover:underline">← Retour à l&apos;accueil</Link>
      </p>
    </>
  );
}
