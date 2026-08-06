import prisma from "../lib/prisma";
import { CATALOG_PRODUCT_INCLUDE, toCatalogProduct, catalogDisplayPrice } from "../lib/catalog/product-view";
import { getGlobalStockForProduct } from "../lib/catalog/stock";

async function main() {
  const slug = "twenty-double-peche-20ml";
  try {
    const product = await prisma.product.findFirst({
      where: { slug, isActive: true, visibleOnline: true },
      include: CATALOG_PRODUCT_INCLUDE,
    });
    if (!product) {
      console.log("PRODUCT_NULL");
      return;
    }
    console.log("loaded", product.name, "variants", product.variants.length);
    const catalog = toCatalogProduct(product);
    console.log("catalog ok", {
      nom: catalog.nom,
      marque: catalog.marque,
      gamme: catalog.gamme,
      format: catalog.format,
      nicotine: catalog.nicotine,
      prix: catalog.prix,
      profil: catalog.profilGustatif,
    });
    const price = catalogDisplayPrice(catalog);
    console.log("price", price);
    const stock = await getGlobalStockForProduct(product.id);
    console.log("stock", stock);
  } catch (e) {
    console.error("CRASH", e);
  }
}

main().finally(() => prisma.$disconnect());
