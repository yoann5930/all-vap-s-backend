import Link from "next/link";
import {
  Facebook,
  Instagram,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import {
  footerNavLinks,
  footerLegalLinks,
  socialLinks,
} from "@/lib/navigation";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-vap-black text-gray-300">
      {/* Wood accent strip */}
      <div className="h-1 bg-gradient-to-r from-wood-400 via-wood-300 to-wood-400" />

      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Logo variant="light" className="mb-4" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-400">
              All Vap&apos;s, votre référence vape dans le Nord.
              Cigarettes électroniques, e-liquides, DIY et accessoires
              dans nos boutiques de Hautmont et Le Quesnoy.
            </p>
            <div className="mt-6 flex gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-vap-gray text-gray-400 transition-colors hover:bg-brand-600 hover:text-white"
                  aria-label={social.label}
                >
                  {social.icon === "facebook" ? (
                    <Facebook className="h-4 w-4" />
                  ) : (
                    <Instagram className="h-4 w-4" />
                  )}
                </a>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
              Navigation
            </h4>
            <ul className="mt-4 space-y-2.5">
              {footerNavLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 transition-colors hover:text-brand-400"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
              Informations légales
            </h4>
            <ul className="mt-4 space-y-2.5">
              {footerLegalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 transition-colors hover:text-brand-400"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-white">
              Contact
            </h4>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/contact"
                  className="flex items-start gap-2.5 text-sm text-gray-400 transition-colors hover:text-brand-400"
                >
                  <Mail className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  Nous contacter
                </Link>
              </li>
              <li>
                <Link
                  href="/boutiques"
                  className="flex items-start gap-2.5 text-sm text-gray-400 transition-colors hover:text-brand-400"
                >
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  Nos boutiques
                </Link>
              </li>
              <li>
                <a
                  href="tel:+33327496100"
                  className="flex items-start gap-2.5 text-sm text-gray-400 transition-colors hover:text-brand-400"
                >
                  <Phone className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  +33 3 27 49 61 00
                </a>
              </li>
            </ul>
            <p className="mt-6 text-xs text-gray-500">
              Vente réservée aux personnes majeures (+18 ans).
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-vap-gray pt-8 sm:flex-row">
          <p className="text-sm text-gray-500">
            © {year} All Vap&apos;s. Tous droits réservés.
          </p>
          <p className="text-xs text-gray-600">
            Paiement sécurisé · Produits conformes TPD
          </p>
        </div>
      </div>
    </footer>
  );
}
