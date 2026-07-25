const REVIEWS = [
  {
    quote: "Accueil impeccable et conseils précis. On se sent vraiment accompagné.",
    author: "Camille R.",
    place: "Hautmont",
  },
  {
    quote: "Une boutique premium, produits soignés, et AVA m’a aidée à choisir mon pod.",
    author: "Julie M.",
    place: "Le Quesnoy",
  },
  {
    quote: "Design du site à la hauteur du magasin. Commande rapide, retrait simple.",
    author: "Thomas L.",
    place: "En ligne",
  },
];

export function ReviewsSection() {
  return (
    <section className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
      <div className="mb-12 max-w-xl">
        <p className="premium-section-label">Confiance</p>
        <h2 className="premium-section-title mt-3">Avis clients</h2>
        <p className="premium-section-subtitle">Ce que disent ceux qui nous font confiance.</p>
      </div>
      <ul className="grid gap-6 md:grid-cols-3">
        {REVIEWS.map((r) => (
          <li
            key={r.author}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-8"
          >
            <p className="text-sm font-light leading-relaxed text-white/70">&ldquo;{r.quote}&rdquo;</p>
            <p className="mt-6 font-display text-xs font-light tracking-[0.16em] text-white/90 uppercase">
              {r.author}
            </p>
            <p className="mt-1 text-xs font-light text-[#8A8A8E]">{r.place}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
