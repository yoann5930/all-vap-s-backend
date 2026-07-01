import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

import { SITE_URL } from "@/lib/seo/config";

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (raw) {
    const cleaned = raw.replace(/\/$/, "");
    return cleaned.startsWith("http") ? cleaned : `https://${cleaned}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  }
  if (process.env.NODE_ENV === "production") {
    return SITE_URL;
  }
  return "http://localhost:3000";
}

export function getBaseUrl(): string {
  return getSiteUrl();
}
