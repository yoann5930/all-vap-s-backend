import { Package, MapPin, ShieldCheck, Headphones } from "lucide-react";

const SERVICES = [
  {
    icon: Package,
    title: "Click & Collect",
    text: "Commandez en ligne, retirez en boutique.",
  },
  {
    icon: MapPin,
    title: "Deux adresses",
    text: "Hautmont et Le Quesnoy, près de chez vous.",
  },
  {
    icon: ShieldCheck,
    title: "Conseil expert",
    text: "Accompagnement premium, en magasin et avec A.V.A.",
  },
  {
    icon: Headphones,
    title: "Support",
    text: "Une équipe à l’écoute pour chaque question.",
  },
];

export function ServicesSection() {
  return (
    <section className="relative border-t border-white/[0.05] bg-[#0C0C0C]/60 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-xl">
          <p className="premium-section-label">Expérience</p>
          <h2 className="premium-section-title mt-3">Services</h2>
        </div>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((s) => (
            <li key={s.title} className="flex flex-col gap-4">
              <s.icon className="h-5 w-5 text-[#3D7EFF]/80" strokeWidth={1.25} aria-hidden />
              <h3 className="font-display text-base font-light tracking-wide text-white">{s.title}</h3>
              <p className="text-sm font-light leading-relaxed text-[#8A8A8E]">{s.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
