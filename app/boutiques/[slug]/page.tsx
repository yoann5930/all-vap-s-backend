import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Phone, Clock, Navigation, Mail, Star, ExternalLink } from "lucide-react";
import { getStoreById } from "@/lib/stores";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Breadcrumb } from "@/components/seo/Breadcrumb";
import { JsonLd } from "@/components/seo/JsonLd";
import { absoluteUrl, DEFAULT_DESCRIPTION } from "@/lib/seo/config";
import { localBusinessSchema } from "@/lib/seo/schema";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const store = getStoreById(slug);
  if (!store) return { title: "Boutique introuvable" };

  const description = `${store.name} — ${store.address}, ${store.postalCode} ${store.city}. Cigarette électronique, e-liquides, pods et conseils experts.`;
  return {
    title: store.name,
    description,
    alternates: { canonical: absoluteUrl(`/boutiques/${slug}`) },
    openGraph: {
      title: `${store.name} | All Vap's`,
      description,
      url: absoluteUrl(`/boutiques/${slug}`),
      images: store.photos[0] ? [store.photos[0]] : [absoluteUrl("/og-image.svg")],
    },
  };
}

export default async function StoreDetailPage({ params }: Props) {
  const { slug } = await params;
  const store = getStoreById(slug);
  if (!store) notFound();

  const avgRating =
    store.googleReviews.length > 0
      ? store.googleReviews.reduce((s, r) => s + r.rating, 0) / store.googleReviews.length
      : 0;

  return (
    <>
      <JsonLd data={localBusinessSchema(store)} />
      <section className="bg-vap-black py-16 text-center sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-400">Boutique All Vap&apos;s</p>
        <h1 className="mt-4 text-4xl font-bold text-white sm:text-5xl">{store.name}</h1>
        <p className="mx-auto mt-4 max-w-2xl px-4 text-gray-400">
          Cigarette électronique, e-liquides et accessoires à {store.city}. Conseils personnalisés et retrait commande.
        </p>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <Breadcrumb
          items={[
            { name: "Accueil", path: "/" },
            { name: "Nos boutiques", path: "/boutiques" },
            { name: store.name, path: `/boutiques/${slug}` },
          ]}
        />

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div>
            <address className="not-italic">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-vap-black">
                <MapPin className="h-6 w-6 text-brand-400" />
              </div>
              <h2 className="text-2xl font-bold text-vap-black">Adresse</h2>
              <p className="mt-3 text-lg text-gray-600">
                {store.address}
                <br />
                {store.postalCode} {store.city}
              </p>
            </address>

            <div className="mt-6 flex flex-wrap gap-3">
              <a href={store.mapsUrl} target="_blank" rel="noopener noreferrer">
                <Button className="gap-2">
                  <Navigation className="h-4 w-4" />
                  Itinéraire
                </Button>
              </a>
              <a href={`tel:${store.phone}`}>
                <Button variant="outline" className="gap-2">
                  <Phone className="h-4 w-4" />
                  {store.phone.replace("+33", "0")}
                </Button>
              </a>
              <a href={`mailto:${store.email}`}>
                <Button variant="wood" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Button>
              </a>
            </div>

            <Card className="mt-6">
              <CardBody>
                <div className="flex items-center gap-2 text-sm font-semibold text-vap-black">
                  <Clock className="h-4 w-4 text-brand-600" />
                  Horaires d&apos;ouverture
                </div>
                <ul className="mt-3 space-y-1 text-sm text-gray-600">
                  {store.hours.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <div className="mt-6 grid grid-cols-3 gap-2">
              {store.photos.map((photo, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
                  <Image
                    src={photo}
                    alt={`${store.name} — photo ${i + 1}`}
                    fill
                    className="object-cover"
                    sizes="200px"
                    loading="lazy"
                  />
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
              title={`Google Maps — ${store.name}`}
              className="w-full"
            />
          </div>
        </div>

        <section className="mt-16">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-vap-black">Avis Google</h2>
              {avgRating > 0 && (
                <div className="mt-2 flex items-center gap-2 text-amber-500">
                  <Star className="h-5 w-5 fill-current" />
                  <span className="font-semibold">{avgRating.toFixed(1)} / 5</span>
                  <span className="text-sm text-gray-500">({store.googleReviews.length} avis)</span>
                </div>
              )}
            </div>
            <a href={store.googleMapsPlaceUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="gap-2">
                Voir sur Google
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {store.googleReviews.map((review) => (
              <Card key={`${review.author}-${review.date}`}>
                <CardBody>
                  <div className="flex items-center gap-1 text-amber-500">
                    {Array.from({ length: review.rating }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5 fill-current" />
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600">&ldquo;{review.text}&rdquo;</p>
                  <p className="mt-3 text-xs font-medium text-gray-500">
                    {review.author} · {review.date}
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>

        <p className="mt-12 text-center text-sm text-gray-500">
          <Link href="/boutique" className="font-medium text-brand-700 hover:underline">
            Découvrir la boutique en ligne
          </Link>
          {" · "}
          <Link href="/boutiques" className="font-medium text-brand-700 hover:underline">
            Toutes nos boutiques
          </Link>
        </p>
      </div>
    </>
  );
}
