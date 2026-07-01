"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface Review {
  rating: number;
  comment: string | null;
  user: { firstName: string | null };
}

interface ProductReviewsClientProps {
  productId: string;
  initialReviews: Review[];
  avgRating: number;
}

export function ProductReviewsClient({ productId, initialReviews, avgRating }: ProductReviewsClientProps) {
  const [reviews, setReviews] = useState(initialReviews);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rating, comment: comment || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");

      setMessage("Merci ! Votre avis sera publié après modération.");
      setComment("");
      setRating(5);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Connectez-vous pour laisser un avis.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Avis clients</h2>
          {avgRating > 0 && (
            <div className="mt-1 flex items-center gap-1 text-amber-500">
              <Star className="h-4 w-4 fill-current" />
              <span className="text-sm font-medium">{avgRating.toFixed(1)} / 5</span>
              <span className="text-sm text-gray-500">({reviews.length} avis)</span>
            </div>
          )}
        </div>
      </div>

      {reviews.length > 0 && (
        <div className="mt-6 space-y-4">
          {reviews.map((r, i) => (
            <div key={i} className="rounded-xl border border-wood-200/60 p-4">
              <p className="text-sm font-medium">{r.user.firstName || "Client"}</p>
              <div className="mt-1 flex text-amber-500">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} className={cn("h-3.5 w-3.5", j < r.rating ? "fill-current" : "text-gray-200")} />
                ))}
              </div>
              {r.comment && <p className="mt-2 text-sm text-gray-600">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 rounded-xl border border-wood-200/60 bg-wood-50/30 p-5">
        <h3 className="font-semibold">Laisser un avis</h3>
        <div className="mt-3 flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRating(i + 1)}
              className="text-amber-500 transition-transform hover:scale-110"
            >
              <Star className={cn("h-6 w-6", i < rating ? "fill-current" : "text-gray-300")} />
            </button>
          ))}
        </div>
        <textarea
          className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          rows={3}
          placeholder="Partagez votre expérience..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}
        <Button type="submit" className="mt-3" loading={loading}>
          Publier mon avis
        </Button>
      </form>
    </section>
  );
}
