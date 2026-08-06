/**
 * Nettoie les faux positifs photothèque (mauvais fabricant / score faible).
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

async function main() {
  const reportPath = path.resolve("data/phototheque/RAPPORT_PHOTOTHEQUE.json");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const bad = (report.produits as any[]).filter((p) => {
    if (p.sourceType !== "local_packshot") return false;
    if (p.family === "INVAPABLE" || p.family === "ENFER" || p.family === "FURIOSA_EGGZ") return true;
    if ((p.matchScore || 0) < 85) return true;
    if (p.family === "ICE_COOL_X" && /mix fruits rouges/i.test(p.name) && /Extra_Fruits/i.test(p.source || "")) return true;
    return false;
  });

  console.log(`Faux positifs à retirer : ${bad.length}`);
  for (const b of bad) {
    if (b.mediaPath && fs.existsSync(b.mediaPath)) fs.unlinkSync(b.mediaPath);
    const thumb = (b.mediaPath || "").replace(/\.webp$/i, "-thumb.webp");
    if (thumb && fs.existsSync(thumb)) fs.unlinkSync(thumb);
    await prisma.productImage.deleteMany({ where: { productId: b.productId } });
    await prisma.product.update({
      where: { id: b.productId },
      data: { imageUrl: null, imageStatus: "pending", images: { set: [] } },
    });
    console.log(`nettoyé: ${b.name}`);
  }

  // Dossier invapable si vide
  const invDir = path.resolve("public/media/products/vape47/invapable");
  if (fs.existsSync(invDir)) {
    for (const f of fs.readdirSync(path.join(invDir, "100ml"), { withFileTypes: true })) {
      /* already deleted files */
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
