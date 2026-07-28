import Image from "next/image";
import { MapPin, Phone, Mail } from "lucide-react";
import { stores } from "@/lib/stores";

export const metadata = {
  title: "Maintenance | All Vap's",
  description:
    "All Vap's met à jour son site. Nos boutiques Hautmont et Le Quesnoy restent ouvertes.",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <main className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-[#05070A] px-4 py-16 text-[#F5F7FA]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_30%,rgba(0,174,239,0.12)_0%,transparent_65%)]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full max-w-xl text-center">
        <Image
          src="/brand/logo-official-dark.png"
          alt="All Vap's"
          width={160}
          height={160}
          priority
          className="mx-auto h-auto w-28 object-contain sm:w-36"
        />

        <p className="mt-8 text-xs font-medium uppercase tracking-[0.22em] text-brand-400">
          Maintenance en cours
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Nous améliorons votre expérience
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[#A7B0BC] sm:text-base">
          Le site allvaps.fr est temporairement indisponible le temps d&apos;une
          refonte. Nos boutiques restent ouvertes pour vous accueillir.
        </p>

        <div className="mt-10 grid gap-3 text-left sm:grid-cols-2">
          {stores.map((store) => (
            <div
              key={store.id}
              className="rounded-2xl border border-white/8 bg-[#101720] p-4"
            >
              <p className="font-display text-base text-[#F5F7FA]">{store.name}</p>
              <p className="mt-2 flex items-start gap-2 text-xs text-[#A7B0BC]">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                {store.address}, {store.postalCode} {store.city}
              </p>
              <a
                href={`tel:${store.phone}`}
                className="mt-2 flex items-center gap-2 text-xs text-[#A7B0BC] transition-colors hover:text-brand-400"
              >
                <Phone className="h-3.5 w-3.5 text-brand-400" />
                {store.phone.replace("+33", "0").replace(/(\d{2})(?=\d)/g, "$1 ").trim()}
              </a>
              <a
                href={`mailto:${store.email}`}
                className="mt-1.5 flex items-center gap-2 text-xs text-[#A7B0BC] transition-colors hover:text-brand-400"
              >
                <Mail className="h-3.5 w-3.5 text-brand-400" />
                {store.email}
              </a>
              <p className="mt-3 text-[11px] text-[#A7B0BC]/80">{store.hours[0]}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs text-[#A7B0BC]/70">
          Merci de votre patience — bientôt de retour avec une boutique en ligne
          encore plus claire.
        </p>

        <p className="mt-6 text-[11px] text-[#A7B0BC]/50">
          Accès équipe :{" "}
          <a href="/login" className="underline decoration-white/20 underline-offset-2 hover:text-brand-400">
            connexion
          </a>
        </p>
      </div>
    </main>
  );
}
