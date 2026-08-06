/**
 * Annule le remplacement aveugle Iced→Ice sur des saveurs Revenge
 * (iced = descripteur de saveur, pas la gamme Ice Cool).
 */
import prisma from "../lib/prisma";

async function main() {
  const fixes = [
    {
      id: "cms6euie501obutmkb2ywb8zo",
      name: "The twin venom iced 50ml - Revenge Juices",
    },
    {
      id: "cms6euiem01oeutmkzoxe1bgv",
      name: "The undertaker iced 50ml - Revenge Juices",
    },
  ];
  for (const f of fixes) {
    await prisma.product.update({ where: { id: f.id }, data: { name: f.name } });
    console.log("restored", f.name);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
