"use client";

import Image from "next/image";
import { useState } from "react";
import {
  manufacturerLogoCandidates,
  manufacturerLogoUrl,
} from "@/lib/catalog/manufacturer-logo";
import {
  logoFrameClassName,
  logoImageStyle,
  resolveLogoDisplay,
} from "@/lib/catalog/logo-display";

type Props = {
  name: string;
  slug?: string | null;
  className?: string;
  mode?: "card" | "inline";
  height?: number;
};

/**
 * Affichage logo fabricant : contain + center + scale/padding selon ratio.
 * Ne coupe jamais le logo ; fond neutre optionnel si besoin de contraste.
 */
export function ManufacturerLogoMark({
  name,
  slug,
  className = "",
  mode = "inline",
  height = 28,
}: Props) {
  const candidates = slug ? manufacturerLogoCandidates(slug) : [];
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = !failed && candidates[idx] ? candidates[idx] : manufacturerLogoUrl(slug);
  const hints = resolveLogoDisplay(slug);

  if (!src || failed) {
    return (
      <p className={`text-xs uppercase tracking-wider text-brand-400 ${className}`.trim()}>
        {name}
      </p>
    );
  }

  const onError = () => {
    if (idx + 1 < candidates.length) setIdx(idx + 1);
    else setFailed(true);
  };

  if (mode === "card") {
    return (
      <div className={`${logoFrameClassName(hints)} ${className}`.trim()}>
        <Image
          src={src}
          alt={`Logo ${name}`}
          width={320}
          height={200}
          className="object-contain object-center"
          style={logoImageStyle(hints)}
          unoptimized
          onError={onError}
        />
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center ${className}`.trim()}>
      <Image
        src={src}
        alt={`Logo ${name}`}
        width={Math.round(height * 3.2)}
        height={height}
        className="h-7 w-auto max-w-[168px] object-contain object-left"
        unoptimized
        onError={onError}
      />
      <span className="sr-only">{name}</span>
    </span>
  );
}
