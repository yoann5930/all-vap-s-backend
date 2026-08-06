import { Truck, ShieldCheck, Users, BadgeCheck } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";

const advantages = [
  {
    icon: Truck,
    title: "Livraison rapide",
    description: "Expédition sous 24 à 48 h en France métropolitaine.",
  },
  {
    icon: ShieldCheck,
    title: "Paiement sécurisé",
    description: "Transactions protégées par paiement sécurisé.",
  },
  {
    icon: Users,
    title: "Conseils d'experts",
    description: "Une équipe passionnée en boutique et en ligne.",
  },
  {
    icon: BadgeCheck,
    title: "Produits conformes TPD",
    description: "Marques reconnues et certifications réglementaires.",
  },
];

export function AdvantagesSection() {
  return (
    <section className="relative py-20 sm:py-24">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {advantages.map((item) => (
            <Card
              key={item.title}
              className="group transition-all duration-500 hover:border-brand-500/20 hover:shadow-[0_0_40px_rgba(0,217,255,0.06)]"
            >
              <CardBody className="text-center sm:text-left">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/5 transition-all duration-300 group-hover:border-brand-400/40 group-hover:shadow-[0_0_20px_rgba(0,217,255,0.15)] sm:mx-0">
                  <item.icon className="h-5 w-5 text-brand-400" strokeWidth={1.5} />
                </div>
                <h3 className="font-display text-base font-light text-white">{item.title}</h3>
                <p className="mt-2 text-sm font-light leading-relaxed text-white/40">{item.description}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
