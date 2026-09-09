"use client";

import Link from "next/link";
import { Cover } from "@/components/cover";
import { InfoIcon, PlayIcon, StarIcon } from "@/components/icons";
import type { CatalogItem } from "@/lib/types";

export function Billboard({
  item,
  metrics,
  playing,
  onPlay,
}: {
  item: CatalogItem;
  metrics?: { rating: number | null; trending: number | null };
  playing: boolean;
  onPlay: () => void;
}) {
  return (
    <section className="relative min-h-[560px] w-full overflow-hidden md:min-h-[640px]">
      {/* Background: soft-blurred poster keeps the hero legible at any size */}
      <div className="absolute inset-0 scale-110">
        <Cover
          src={item.poster_url}
          alt=""
          className="object-cover blur-3xl saturate-[1.2] opacity-50"
          sizes="100vw"
          priority
        />
      </div>
      {/* Foreground artwork is optional when crisp backdrops are unavailable;
          a bottom-anchored portrait crop adds premium depth on wide screens. */}
      <div className="absolute inset-0 hidden bg-gradient-to-r from-ink via-ink/60 to-transparent lg:block" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/75" />
      {/* Green top hairline glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent shadow-[0_0_14px_rgba(34,197,94,0.45)]" />

      {metrics && (metrics.rating || metrics.trending) && (
        <div className="pointer-events-none absolute right-6 top-24 z-10 hidden flex-col items-end gap-1.5 text-right md:flex">
          {metrics.rating != null && (
            <span className="flex items-center gap-1 text-sm font-semibold text-amber-400">
              <StarIcon width={14} height={14} /> {metrics.rating.toFixed(1)}
            </span>
          )}
          {metrics.trending != null && (
            <span className="flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-100 backdrop-blur">
              <span className="h-1 w-1 rounded-full bg-brand" />#{Math.round(metrics.trending)} Trending
            </span>
          )}
        </div>
      )}

      <div className="relative z-10 mx-auto flex min-h-[560px] max-w-[1500px] flex-col justify-end px-5 pb-14 md:min-h-[640px] md:px-10">
        <div className="animate-fade-up max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-300">
            <span className="h-px w-8 bg-brand" />
            {item.media_type === "series" ? "Series" : "Movie"}
            {item.year ? <span className="text-zinc-400">· {item.year}</span> : null}
          </div>
          <h1 className="text-balance text-4xl font-black leading-[1.05] tracking-tight text-white drop-shadow-2xl sm:text-6xl md:text-7xl">
            {item.title}
          </h1>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              onClick={onPlay}
              className="group flex items-center gap-2.5 rounded-xl bg-brand px-7 py-3 text-lg font-bold text-black shadow-[0_10px_30px_rgba(0,0,0,0.45),0_0_28px_rgba(34,197,94,0.25)] transition duration-200 hover:bg-brand-hover hover:shadow-[0_0_38px_rgba(74,222,128,0.45)] active:scale-[0.98]"
            >
              <PlayIcon width={20} height={20} className="translate-x-px" />
              Play
            </button>
            <Link
              href={`/title/${item.id.provider}/${item.id.value}`}
              className="flex items-center gap-2.5 rounded-xl bg-white/10 px-6 py-3 text-lg font-semibold text-white ring-1 ring-white/15 backdrop-blur transition duration-200 hover:bg-white/20 hover:ring-white/25"
            >
              <InfoIcon width={20} height={20} />
              More Info
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom polish line */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink to-transparent" />
    </section>
  );
}
