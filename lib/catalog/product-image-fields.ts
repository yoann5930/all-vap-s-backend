import { ensureProductImageEtastyStyle } from "@/lib/catalog/normalize-product-image";

type ProductImageContext = {
  productName: string;
  brand?: string | null;
  manufacturerSlug?: string | null;
  rangeSlug?: string | null;
  format?: string | null;
  productSlug: string;
};

type ProductImageFields = {
  imageUrl?: string | null;
  images?: string[];
};

function gallerySlug(baseSlug: string, index: number): string {
  return `${baseSlug}-gallery-${index + 1}`;
}

export async function normalizeProductImageFields(
  context: ProductImageContext,
  fields: ProductImageFields
): Promise<ProductImageFields> {
  const result: ProductImageFields = {};
  let normalizedPrimary: string | null | undefined;

  if (Object.prototype.hasOwnProperty.call(fields, "imageUrl")) {
    if (fields.imageUrl) {
      normalizedPrimary = await ensureProductImageEtastyStyle({
        sourceUrl: fields.imageUrl,
        productName: context.productName,
        brand: context.brand,
        manufacturerSlug: context.manufacturerSlug,
        rangeSlug: context.rangeSlug,
        format: context.format,
        productSlug: context.productSlug,
      });
      result.imageUrl = normalizedPrimary;
    } else {
      normalizedPrimary = fields.imageUrl;
      result.imageUrl = fields.imageUrl;
    }
  }

  if (Object.prototype.hasOwnProperty.call(fields, "images")) {
    result.images = await Promise.all(
      (fields.images ?? []).map(async (sourceUrl, index) => {
        if (fields.imageUrl && sourceUrl === fields.imageUrl && normalizedPrimary) {
          return normalizedPrimary;
        }

        return ensureProductImageEtastyStyle({
          sourceUrl,
          productName: context.productName,
          brand: context.brand,
          manufacturerSlug: context.manufacturerSlug,
          rangeSlug: context.rangeSlug,
          format: context.format,
          productSlug: gallerySlug(context.productSlug, index),
        });
      })
    );
  }

  return result;
}
