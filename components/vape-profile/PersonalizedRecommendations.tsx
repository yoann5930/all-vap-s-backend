"use client";

import Link from "next/link";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/Card";
import { getEffectivePrice } from "@/lib/products/queries";
import {
  PRODUCT_CARD_IMAGE_QUALITY,
  isPreoptimizedProductMedia,
} from "@/lib/catalog/product-image-display";

interface RecommendationItem {
  product: {
    id: string;
    name: string;
    slug: string;
    imageUrl?: string | null;
    priceCents: number;
    promoPriceCents?: number | null;
    isPromo?: boolean;
  };
  score: number;
  reason: string;
}

interface PersonalizedRecommendationsProps {
  recommendations: RecommendationItem[];
  title?: string;
}

export function PersonalizedRecommendations({
  recommendations,
  title = "Nouveautés recommandées pour moi",
}: PersonalizedRecommendationsProps) {
  if (recommendations.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-gray-600">
            Complétez votre profil vape pour recevoir des recommandations indicatives adaptées à vos goûts.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div>
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <Sparkles className="h-5 w-5 text-brand-600" />
        {title}
      </h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recommendations.map((r) => (
          <Link key={r.product.id} href={`/boutique/${r.product.slug}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardBody>
                <div className="relative aspect-square overflow-hidden rounded-lg bg-[#0B1016]">
                  {r.product.imageUrl ? (
                    isPreoptimizedProductMedia(r.product.imageUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.product.imageUrl}
                        alt={r.product.name}
                        className="absolute inset-0 h-full w-full object-contain p-2"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <Image
                        src={r.product.imageUrl}
                        alt={r.product.name}
                        fill
                        className="object-contain p-2"
                        sizes="200px"
                        quality={PRODUCT_CARD_IMAGE_QUALITY}
                      />
                    )
                  ) : null}
                </div>
                <p className="mt-3 font-medium">{r.product.name}</p>
                <p className="text-sm font-semibold text-brand-700">
                  {formatPrice(getEffectivePrice(r.product))}
                </p>
                <p className="mt-1 text-xs text-gray-500">{r.reason}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
