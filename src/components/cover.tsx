import Image from "next/image";
import { useState } from "react";
import type { CatalogItem, MediaType } from "@/lib/types";

export function qualityLabel(item: CatalogItem): string | null {
  if (item.media_type === "series") {
    return item.season_count && item.season_count > 0
      ? `${item.season_count} Season${item.season_count > 1 ? "s" : ""}`
      : "Series";
  }
  if (item.year) return item.year;
  return null;
}

/** Cover artwork with shimmer while loading and a graceful fallback tile. */
export function Cover({
  src,
  alt,
  className = "",
  sizes = "240px",
  priority = false,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`grid place-items-center bg-gradient-to-br from-surface-2 via-surface to-ink ${className}`}
        aria-label={alt}
      >
        <span className="select-none text-2xl font-black tracking-tight text-brand/60 drop-shadow-[0_0_14px_rgba(34,197,94,0.15)]">
          {alt.trim().charAt(0).toUpperCase() || "?"}
        </span>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={className}
      onError={() => setFailed(true)}
      unoptimized
    />
  );
}

export function mediaTypeLabel(type: MediaType): string {
  return type === "series" ? "Series" : "Movie";
}
