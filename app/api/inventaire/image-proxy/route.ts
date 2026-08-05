import { NextRequest } from "next/server";
import { jsonResponse, handleApiError } from "@/lib/api-utils";
import { requireInventoryAuth } from "@/lib/inventory/auth";

/**
 * Proxy images fabricants (lecture seule) — évite CORS pour la reconnaissance visuelle.
 * Domaines autorisés uniquement (sites officiels / CDN connus).
 */

const ALLOWED_HOST_SUFFIXES = [
  "liquidarom.com",
  "liquidelab.com",
  "e-tasty.fr",
  "vapair.pro",
  "vape47.com",
  "pulp.fr",
  "alfaliquid.com",
  "lefrenchliquide.com",
  "vincentdanslesvapes.com",
  "dinnerlady.com",
  "vampirevape.co.uk",
  "curieux.fr",
  "protect.fr",
  "revolute.fr",
  "flavourpower.com",
  "solana-ecig.com",
  "happyliquide.com",
  "lespetitsplaisirs.com",
  "vaporesso.com",
  "geekvape.com",
  "innokin.com",
  "voopoo.com",
  "smoktech.com",
  "lostvape.com",
  "capellaflavors.com",
  "unsplash.com",
  "images.unsplash.com",
];

function hostAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return ALLOWED_HOST_SUFFIXES.some(
    (s) => h === s || h.endsWith(`.${s}`)
  );
}

export async function GET(request: NextRequest) {
  try {
    await requireInventoryAuth();
    const raw = request.nextUrl.searchParams.get("url") || "";
    if (!raw || raw.length > 800) {
      return jsonResponse({ error: "URL manquante" }, 400);
    }

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return jsonResponse({ error: "URL invalide" }, 400);
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return jsonResponse({ error: "Protocole interdit" }, 400);
    }
    if (!hostAllowed(target.hostname)) {
      return jsonResponse({ error: "Domaine non autorisé" }, 403);
    }

    // Remonte vignettes Prestashop floues → large_default
    let fetchUrl = target.toString();
    fetchUrl = fetchUrl
      .replace(/home_default/gi, "large_default")
      .replace(/small_default/gi, "large_default")
      .replace(/medium_default/gi, "large_default");

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(fetchUrl, {
        signal: ctrl.signal,
        headers: {
          Accept: "image/*,*/*",
          "User-Agent": "AllVaps-Inventory/1.0 (+visual-proxy)",
        },
        redirect: "follow",
        cache: "force-cache",
      });
      if (!res.ok && fetchUrl !== target.toString()) {
        // fallback URL d’origine
        const res2 = await fetch(target.toString(), {
          signal: ctrl.signal,
          headers: {
            Accept: "image/*,*/*",
            "User-Agent": "AllVaps-Inventory/1.0 (+visual-proxy)",
          },
          redirect: "follow",
          cache: "force-cache",
        });
        if (!res2.ok) return new Response("Image introuvable", { status: 404 });
        const buf2 = await res2.arrayBuffer();
        const ctype2 = res2.headers.get("content-type") || "image/jpeg";
        return new Response(buf2, {
          headers: {
            "Content-Type": ctype2.startsWith("image/") ? ctype2 : "image/jpeg",
            "Cache-Control": "private, max-age=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      if (!res.ok) {
        return new Response("Image introuvable", { status: 404 });
      }
      const ctype = res.headers.get("content-type") || "image/jpeg";
      if (!/^image\//i.test(ctype) && !/octet-stream/i.test(ctype)) {
        return jsonResponse({ error: "Pas une image" }, 415);
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 4_000_000) {
        return jsonResponse({ error: "Image trop grande" }, 413);
      }
      return new Response(buf, {
        headers: {
          "Content-Type": ctype.startsWith("image/") ? ctype : "image/jpeg",
          "Cache-Control": "private, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } finally {
      clearTimeout(t);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
