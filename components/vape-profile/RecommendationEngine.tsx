"use client";

import { useEffect, useState } from "react";
import { PersonalizedRecommendations } from "@/components/vape-profile/PersonalizedRecommendations";
import { AssistantMemorySummary } from "@/components/vape-profile/AssistantMemorySummary";
import { MEDICAL_DISCLAIMER } from "@/lib/vape-profile/types";

interface RecommendationEngineProps {
  enabled: boolean;
}

export function RecommendationEngine({ enabled }: RecommendationEngineProps) {
  const [data, setData] = useState<{
    recommendations: Array<{ product: { id: string; name: string; slug: string; imageUrl?: string | null; priceCents: number; promoPriceCents?: number | null; isPromo?: boolean }; score: number; reason: string }>;
    greeting: string | null;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    fetch("/api/account/recommendations")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="space-y-6">
      {data?.greeting && <AssistantMemorySummary greeting={data.greeting} history={[]} />}
      <PersonalizedRecommendations recommendations={data?.recommendations ?? []} />
      <p className="text-xs text-gray-500">{MEDICAL_DISCLAIMER}</p>
    </div>
  );
}
