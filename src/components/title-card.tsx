"use client";

import Link from "next/link";
import { memo } from "react";
import { Cover, qualityLabel } from "@/components/cover";
import { PlayIcon } from "@/components/icons";
import type { CatalogItem } from "@/lib/types";

export const TitleCard = memo(function TitleCard({
  item,
  rank,
}: {
  item: CatalogItem;
  rank?: number;
}) {
  const href = `/title/${item.id.provider}/${item.id.value}`;
  const label = qualityLabel(item);

  return (
    <Link
      href={href}
      className="tile group relative block w-full shrink-0 cursor-pointer overflow-hidden rounded-xl bg-surface outline-none ring-white/0 focus-visible:ring-2 focus-visible:ring-[#4ade80]/70"
      aria-label={item.title}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden">
        <Cover
          src={item.poster_url}
          alt={item.title}
          className="transition duration-300 group-hover:scale-[1.06]"
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 22vw, 13vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
        {/* Center play affordance */}
        <div className="absolute inset-0 grid place-items-center opacity-0 transition duration-200 group-hover:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand text-black shadow-[0_0_24px_rgba(34,197,94,0.45)] ring-2 ring-white/25 transition duration-200 group-hover:scale-110 group-hover:bg-brand-hover group-hover:shadow-[0_0_32px_rgba(74,222,128,0.6)]">
            <PlayIcon width={18} height={18} className="translate-x-0.5" />
          </span>
        </div>
        {/* Bottom info */}
        <div className="absolute inset-x-0 bottom-0 translate-y-1 p-3 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-white drop-shadow">
            {item.title}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-300">
            {item.media_type === "series" && (
              <span className="rounded bg-brand px-1 py-px font-bold text-black">SERIES</span>
            )}
            {label && <span>{label}</span>}
          </div>
        </div>
      </div>
      {rank != null && (
        <span className="pointer-events-none absolute -left-2 bottom-[-0.9em] z-10 select-none text-[7rem] font-black leading-none tracking-tighter text-black drop-shadow-[0_0_18px_rgba(0,0,0,0.9)]">
          {rank}
        </span>
      )}
    </Link>
  );
});
