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
    title: "Paiement sécurisé Viva.com",
    description: "Transactions protégées et paiement en toute confiance.",
  },
  {
    icon: Users,
    title: "Conseils d'experts",
    description: "Une équipe passionnée disponible en boutique et en ligne.",
  },
  {
    icon: BadgeCheck,
    title: "Produits conformes TPD",
    description: "Marques reconnues et produits certifiés conformément à la réglementation.",
  },
];

export function AdvantagesSection() {
  return (
    <section className="relative bg-wood-50 py-16 sm:py-20">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-wood-300 to-transparent" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {advantages.map((item) => (
            <Card
              key={item.title}
              className="group border-wood-200/60 bg-white transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-600/5"
            >
              <CardBody className="text-center sm:text-left">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-vap-black transition-colors group-hover:bg-brand-600 sm:mx-0">
                  <item.icon className="h-6 w-6 text-brand-400 group-hover:text-white" />
                </div>
                <h3 className="font-semibold text-vap-black">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {item.description}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
