import {
  Droplets,
  MapPin,
  Flame,
  Headphones,
  BadgeCheck,
} from "lucide-react";

const ITEMS = [
  {
    icon: Droplets,
    title: "+ DE 250 SAVEURS",
    subtitle: "E-liquides premium",
  },
  {
    icon: MapPin,
    title: "2 BOUTIQUES",
    subtitle: "Le Quesnoy & Hautmont",
  },
  {
    icon: Flame,
    title: "BAR À VAPE",
    subtitle: "Testez avant d'acheter",
  },
  {
    icon: Headphones,
    title: "EXPERTS À L'ÉCOUTE",
    subtitle: "Conseils personnalisés",
  },
  {
    icon: BadgeCheck,
    title: "SATISFAIT OU REMBOURSÉ",
    subtitle: "14 jours pour changer d'avis",
  },
];

export function TrustBar() {
  return (
    <section className="border-y border-white/8 bg-[#070A0F]">
      <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-4 px-4 py-6 sm:px-6 md:grid-cols-3 lg:grid-cols-5 lg:px-8">
        {ITEMS.map(({ icon: Icon, title, subtitle }) => (
          <div key={title} className="flex items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" strokeWidth={1.6} />
            <div>
              <p className="text-[11px] font-bold tracking-wide text-white">{title}</p>
              <p className="mt-0.5 text-[11px] text-[#A7B0BC]">{subtitle}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
