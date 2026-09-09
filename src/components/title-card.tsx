"use client";

import Link from "next/link";
import { memo } from "react";
import { Cover } from "@/components/cover";
import { PlayIcon } from "@/components/icons";
import type { CatalogItem } from "@/lib/types";

/** Mono meta line ("01 SEASONS · 2024" / "2024") shown under the title on hover. */
function metaLine(item: CatalogItem): string {
  const parts: string[] = [];
  if (item.media_type === "series") {
    parts.push(
      item.season_count != null && item.season_count > 0
        ? `${String(item.season_count).padStart(2, "0")} SEASONS`
        : "SERIES",
    );
    if (item.year) parts.push(item.year);
  } else {
    parts.push(item.year ?? "MOVIE");
  }
  return parts.join(" · ");
}

export const TitleCard = memo(function TitleCard({
  item,
  rank,
}: {
  item: CatalogItem;
  rank?: number;
}) {
  const href = `/title/${item.id.provider}/${item.id.value}`;

  return (
    <Link
      href={href}
      className="group relative block w-full shrink-0 cursor-pointer rounded-lg outline-none ring-1 ring-line transition duration-300 ease-out hover:z-10 hover:scale-[1.02] hover:shadow-[0_10px_22px_rgba(0,0,0,0.35),0_0_22px_rgba(34,197,94,0.14)] hover:ring-brand/60 focus-visible:ring-2 focus-visible:ring-[#4ade80]/80"
      aria-label={item.title}
    >
      <div className="tick-corners relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-surface">
        <Cover
          src={item.poster_url}
          alt={item.title}
          className="transition duration-300 group-hover:scale-[1.04]"
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 13vw"
        />
        {/* Bottom gradient that hosts the hover meta line */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />

        {/* Rank chip — mono, top-left, catalog style */}
        {rank != null && (
          <span className="pointer-events-none absolute left-2 top-2 z-10 select-none rounded-[4px] bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.14em] text-brand ring-1 ring-brand/25 backdrop-blur-sm">
            No. {String(rank).padStart(2, "0")}
          </span>
        )}

        {/* Play affordance — small square green chip that slides in top-right */}
        <span className="pointer-events-none absolute right-2 top-2 z-10 -translate-y-1.5 opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100">
          <span className="grid h-8 w-8 place-items-center rounded-[6px] bg-brand text-black shadow-[0_0_16px_rgba(34,197,94,0.5)] ring-1 ring-black/40 transition duration-200 group-hover:bg-brand-hover">
            <PlayIcon width={13} height={13} className="translate-x-px" />
          </span>
        </span>

        {/* Bottom mono meta line (title + identity strip) */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 p-2.5 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <span className="block truncate text-[13px] font-semibold leading-tight text-white drop-shadow">
            {item.title}
          </span>
          <span className="mono-meta mt-1 block truncate text-[10px] uppercase tracking-[0.14em] text-zinc-300">
            {metaLine(item)}
          </span>
        </span>
      </div>
    </Link>
  );
});
