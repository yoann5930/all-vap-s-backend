import Link from "next/link";

const BRANDS = [
  "GeekVape",
  "Vaporesso",
  "Pulp",
  "Alfaliquid",
  "Lost Vape",
  "Innokin",
  "Voopoo",
  "Smok",
];

export function BrandsSection() {
  return (
    <section className="relative border-y border-white/[0.05] bg-[#0C0C0C]/80 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="premium-section-label">Sélection</p>
            <h2 className="premium-section-title mt-3">Marques</h2>
          </div>
          <Link href="/boutique" className="text-sm font-light text-[#8A8A8E] transition-colors hover:text-[#3D7EFF]">
            Voir le catalogue →
          </Link>
        </div>
        <ul className="flex flex-wrap gap-x-10 gap-y-6">
          {BRANDS.map((name) => (
            <li
              key={name}
              className="font-display text-lg font-extralight tracking-[0.12em] text-white/35 uppercase transition-colors hover:text-white/80"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
