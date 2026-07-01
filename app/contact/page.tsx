import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { StoresSection } from "@/components/home/StoresSection";
import { absoluteUrl } from "@/lib/seo/config";

export const metadata = {
  title: "Contact",
  description: "Contactez All Vap's — boutiques cigarette électronique à Hautmont et Le Quesnoy.",
  alternates: { canonical: absoluteUrl("/contact") },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold text-vap-black">Contact</h1>
        <p className="mt-3 text-gray-600">
          Une question ? Notre équipe All Vap&apos;s est à votre disposition.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardBody className="text-center">
            <Mail className="mx-auto h-8 w-8 text-brand-600" />
            <h2 className="mt-4 font-semibold">Email</h2>
            <a
              href="mailto:contact@allvaps.fr"
              className="mt-2 block text-brand-700 hover:text-brand-800"
            >
              contact@allvaps.fr
            </a>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <Phone className="mx-auto h-8 w-8 text-brand-600" />
            <h2 className="mt-4 font-semibold">Téléphone</h2>
            <a
              href="tel:+33327496100"
              className="mt-2 block text-brand-700 hover:text-brand-800"
            >
              +33 3 27 49 61 00
            </a>
          </CardBody>
        </Card>
      </div>

      <div className="mt-16">
        <StoresSection showTitle={false} />
      </div>

      <p className="mt-8 text-center text-sm text-gray-500">
        <Link href="/" className="text-brand-700 hover:underline">
          ← Retour à l&apos;accueil
        </Link>
      </p>
    </div>
  );
}
