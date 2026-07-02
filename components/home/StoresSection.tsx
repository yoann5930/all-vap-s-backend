"use client";

import { useState } from "react";
import { MapPin, Phone, Clock, Navigation, ArrowRight } from "lucide-react";import { stores, type Store } from "@/lib/stores";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

function StoreCard({ store }: { store: Store }) {
  const [showHours, setShowHours] = useState(false);

  return (
    <Card className="overflow-hidden border-wood-200/60 bg-white transition-all duration-300 hover:shadow-xl hover:shadow-vap-black/5">
      <div className="h-2 bg-gradient-to-r from-brand-600 via-brand-500 to-wood-400" />
      <CardBody className="p-6 sm:p-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-vap-black">
          <MapPin className="h-6 w-6 text-brand-400" />
        </div>

        <h3 className="text-xl font-bold text-vap-black">{store.name}</h3>

        <address className="mt-3 not-italic text-gray-600">
          <p>{store.address}</p>
          <p>
            {store.postalCode} {store.city}
          </p>
        </address>

        <div className="mt-6 flex flex-wrap gap-2">
          <a href={store.mapsUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="primary" size="sm" className="gap-1.5">
              <Navigation className="h-3.5 w-3.5" />
              Itinéraire
            </Button>
          </a>
          <a href={`tel:${store.phone}`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Phone className="h-3.5 w-3.5" />
              Appeler
            </Button>
          </a>
          <Button
            variant="wood"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowHours(!showHours)}
            aria-expanded={showHours}
          >
            <Clock className="h-3.5 w-3.5" />
            Horaires
          </Button>
          <Button href={`/boutiques/${store.id}`} variant="outline" size="sm" className="gap-1.5">
            Fiche boutique
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {showHours && (
          <div className="animate-fade-in mt-4 rounded-lg bg-wood-50 px-4 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-wood-500">
              Horaires d&apos;ouverture
            </p>
            <ul className="space-y-1 text-sm text-gray-700">
              {store.hours.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

interface StoresSectionProps {
  id?: string;
  showTitle?: boolean;
}

export function StoresSection({ id = "boutiques", showTitle = true }: StoresSectionProps) {
  return (
    <section id={id} className="bg-vap-black py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {showTitle && (
          <div className="mb-12 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-400">
              Près de chez vous
            </p>
            <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              Nos boutiques
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-gray-400">
              Retrouvez l&apos;expertise All Vap&apos;s dans nos deux magasins
              du Nord. Conseils personnalisés et large choix de produits.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {stores.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </div>
      </div>
    </section>
  );
}
