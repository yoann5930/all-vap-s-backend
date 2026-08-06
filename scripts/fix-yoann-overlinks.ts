/**
 * Corrige les sur-rattachements SumUp du pass Yoann.
 * Règle : un produit ne reste sur une gamme que si son nom SumUp/catalogue
 * contient le nom de gamme (ou un alias fort), pas seulement un arôme générique.
 *
 * Usage: npx tsx scripts/fix-yoann-overlinks.ts --apply
 */
import prisma from "../lib/prisma";
import { normalizeForMatch } from "../lib/catalog/official-verification";

const RANGE_TOKENS: Record<string, string[]> = {
  twenty: ["twenty"],
  letters: ["letters"],
  "god-fall-city": ["godfall", "god fall", "dzeus", "posei", "thena", "adess"],
  "unik-airmust": ["unik"],
  "granita-soft-alfa": ["granita"],
  "dragonzz-liquideo": ["dragonzz", "dragonz", "dragon mangue", "dragon fruits", "dragon myrtille", "dragon pasteque"],
  "force-vape-swoke": ["force vape"],
  "66-juice-juice-66": ["66 juice", "juice 66"],
  "mythologie-aromes-secrets": ["mythologie"],
  "miv-distrib-made-in-vape-distrib": ["miv"],
  "grand-taste-city-cloud-vapor": ["grand taste"],
  "call-of-vape": ["call of vape"],
  "cloud-empire-the-fuu": ["cloud empire"],
  "l-ovalie-airmust": ["ovalie", "plaquage", "transformation", "le drop"],
  "devil-avap": ["devil", "red devil"],
  myst: ["myst", "mist"],
  enfer: ["enfer"],
  "les-fruits-d-enfer": ["fruits d enfer", "fruits d'enfer"],
  "furiosa-eggz": ["furiosa", "eggz"],
  "evolution-liquideo": ["evolution", "liquideo"],
  "freeze-citrus-liquideo": ["freeze citrus", "freeze"],
  "big-kawa": ["big kawa", "cafe frappe", "cafe noisette", "cafe caramel"],
  "overdrive-juices-overdrive-juices": ["overdrive"],
  "revenge-juices-revenge-juices": ["revenge"],
  "t-juice-50-ml": ["t-juice", "t juice", "red astaire"],
  "mintai-a-eliquid-france": ["mintai", "mintaia"],
  "lemon-time-eliquid-france": ["lemon time", "lemontime"],
  "fruizee-max-eliquid-france": ["fruizee max"],
  "hopper-airmust": ["hopper"],
  "blue-hopper-airmust": ["blue hopper"],
  "ferox-airmust": ["ferox"],
  "press-start-airmust": ["press start"],
};

async function main() {
  const apply = process.argv.includes("--apply");
  const ranges = await prisma.productRange.findMany({
    include: { manufacturer: { select: { id: true, name: true, slug: true } } },
  });

  let unlinked = 0;
  let kept = 0;

  for (const range of ranges) {
    const tokens = RANGE_TOKENS[range.slug];
    if (!tokens) continue;
    const normTokens = tokens.map(normalizeForMatch);

    const products = await prisma.product.findMany({
      where: { rangeId: range.id },
      select: {
        id: true,
        name: true,
        sumupName: true,
        brand: true,
        source: true,
        sumupProductId: true,
      },
    });

    for (const p of products) {
      const hay = normalizeForMatch([p.sumupName, p.name, p.brand].filter(Boolean).join(" "));
      const ok = normTokens.some((t) => hay.includes(t));
      // conserver les fiches catalogue créées volontairement (official_catalog)
      if (ok || p.source === "official_catalog") {
        kept++;
        continue;
      }
      console.log(`UNLINK ${range.slug} ← ${p.sumupName || p.name}`);
      if (apply) {
        await prisma.product.update({
          where: { id: p.id },
          data: { rangeId: null },
        });
      }
      unlinked++;
    }
  }

  console.log(JSON.stringify({ apply, kept, unlinked }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
