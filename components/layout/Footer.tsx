import Link from "next/link";
import { Facebook, Instagram, Mail, MapPin, Phone, Clock } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { NewsletterSignup } from "@/components/layout/NewsletterSignup";
import { footerNavLinks, footerLegalLinks, socialLinks } from "@/lib/navigation";
import { stores } from "@/lib/stores";

export function Footer() {
  const year = new Date().getFullYear();
  const mainStore = stores[0];

  return (
    <footer className="relative border-t border-white/6 bg-premium-dark">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/30 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo variant="official" size={42} />
            <p className="mt-5 max-w-sm text-sm font-light leading-relaxed text-white/40">
              All Vap&apos;s — référence premium de la vape dans le Nord.
              Cigarettes électroniques, e-liquides, DIY et accessoires à Hautmont et Le Quesnoy.
            </p>
            <div className="mt-6 flex gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/3 text-white/40 transition-all duration-300 hover:border-brand-500/30 hover:text-brand-400 hover:shadow-[0_0_20px_rgba(0,217,255,0.15)]"
                  aria-label={social.label}
                >
                  {social.icon === "facebook" ? (
                    <Facebook className="h-4 w-4" strokeWidth={1.5} />
                  ) : (
                    <Instagram className="h-4 w-4" strokeWidth={1.5} />
                  )}
                </a>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            <h4 className="font-display text-xs font-light tracking-[0.2em] text-white/70 uppercase">
              Navigation
            </h4>
            <ul className="mt-5 space-y-3">
              {footerNavLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm font-light text-white/40 transition-colors hover:text-brand-400">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <h4 className="font-display text-xs font-light tracking-[0.2em] text-white/70 uppercase">
              Légal
            </h4>
            <ul className="mt-5 space-y-3">
              {footerLegalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm font-light text-white/40 transition-colors hover:text-brand-400">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-4">
            <h4 className="font-display text-xs font-light tracking-[0.2em] text-white/70 uppercase">
              Contact & horaires
            </h4>
            <ul className="mt-5 space-y-3">
              <li>
                <a href="tel:+33327496100" className="flex items-center gap-2.5 text-sm font-light text-white/40 transition-colors hover:text-brand-400">
                  <Phone className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  +33 3 27 49 61 00
                </a>
              </li>
              <li>
                <Link href="/contact" className="flex items-center gap-2.5 text-sm font-light text-white/40 transition-colors hover:text-brand-400">
                  <Mail className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  Nous contacter
                </Link>
              </li>
              <li>
                <Link href="/boutiques" className="flex items-center gap-2.5 text-sm font-light text-white/40 transition-colors hover:text-brand-400">
                  <MapPin className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  Nos boutiques
                </Link>
              </li>
              {mainStore.hours.map((h) => (
                <li key={h} className="flex items-start gap-2.5 text-sm font-light text-white/35">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
                  {h}
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <p className="mb-3 font-display text-xs font-light tracking-[0.15em] text-white/50 uppercase">
                Newsletter
              </p>
              <NewsletterSignup />
            </div>
          </div>
        </div>

        {mainStore && (
          <div className="mt-14 overflow-hidden rounded-2xl border border-white/6">
            <iframe
              title="All Vap's — localisation boutique"
              src={mainStore.embedMapUrl}
              className="h-48 w-full grayscale opacity-80 transition-opacity hover:opacity-100 sm:h-56"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        )}

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/6 pt-8 sm:flex-row">
          <p className="text-xs font-light text-white/30">© {year} All Vap&apos;s. Tous droits réservés.</p>
          <p className="text-[11px] font-light text-white/25">
            Vente réservée aux +18 ans · Paiement sécurisé · Produits conformes TPD
          </p>
        </div>
      </div>
    </footer>
  );
}
