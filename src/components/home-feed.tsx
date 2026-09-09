"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Billboard } from "@/components/billboard";
import { PlayIcon } from "@/components/icons";
import { TitleRow } from "@/components/title-row";
import { getHistory, WatchEntry } from "@/lib/history";
import { buildMetricRows, buildTypeRows, metricOf, pickHero } from "@/lib/rows";
import type { BrowseMetrics, CatalogItem } from "@/lib/types";

interface FeedProps {
  feed: CatalogItem[] | null;
  metrics: Record<string, BrowseMetrics>;
  error: string | null;
}

export function HomeFeed({ feed, metrics, error }: FeedProps) {
  const [history, setHistory] = useState<WatchEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const all = getHistory().filter(
      (e) => !(e.duration > 0 && e.position / e.duration > 0.98),
    );
    setHistory(all);
    setReady(true);
  }, []);

  if (error || !feed) {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="text-5xl">📡</p>
        <h1 className="text-2xl font-bold">Backend not reachable</h1>
        <p className="max-w-md text-sm leading-relaxed text-zinc-400">
          {error ?? "The MovieBox Rust backend did not respond."} Start it with{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-zinc-300">npm run dev</code>{" "}
          (launches both servers) or{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-zinc-300">npm run backend</code>
          , then reload.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-black shadow-[0_0_22px_rgba(34,197,94,0.2)] transition duration-200 hover:bg-brand-hover hover:shadow-[0_0_30px_rgba(74,222,128,0.35)]"
        >
          Retry
        </button>
      </div>
    );
  }

  const hero = pickHero(feed, metrics);
  const metricRows = buildMetricRows(feed, metrics);
  const typeRows = buildTypeRows(feed, metrics);

  if (!hero) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <p className="text-zinc-500">No titles available right now.</p>
      </div>
    );
  }

  const heroMetrics = metricOf(hero, metrics);

  return (
    <div className="pb-20">
      <Billboard
        item={hero}
        metrics={{ rating: heroMetrics.rating ?? null, trending: heroMetrics.trending ?? null }}
        playing={false}
        onPlay={() =>
          window.location.assign(`/watch/${hero.id.provider}/${hero.id.value}`)
        }
      />

      <div className="relative z-10 mx-auto -mt-24 max-w-[1500px] space-y-10 px-5 md:-mt-16 md:px-10">
        {ready && history.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-bold tracking-tight text-zinc-50 md:text-xl">
              Continue Watching
            </h2>
            <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
              {history.map((entry) => (
                <WatchCard key={entryKey(entry)} entry={entry} />
              ))}
            </div>
          </section>
        )}

        {metricRows.map((row) => (
          <TitleRow key={row.key} label={row.label} items={row.items} />
        ))}
        {typeRows.map((row) => (
          <TitleRow key={row.key} label={row.label} items={row.items} />
        ))}
      </div>
    </div>
  );
}

function entryKey(e: WatchEntry) {
  return `${e.provider}:${e.id}:${e.season}:${e.episode}`;
}

function WatchCard({ entry }: { entry: WatchEntry }) {
  const pct =
    entry.duration > 0 ? Math.min(100, Math.round((entry.position / entry.duration) * 100)) : 5;
  const href = `/watch/${entry.provider}/${entry.id}?${
    entry.mediaType === "series" ? `s=${entry.season}&e=${entry.episode}` : ""
  }`;
  return (
    <Link
      href={href}
      className="group w-[34%] shrink-0 sm:w-[22%] md:w-[16%] lg:w-[12.5%]"
      aria-label={entry.title}
    >
      <div className="relative overflow-hidden rounded-xl bg-surface ring-1 ring-transparent transition duration-200 group-hover:ring-brand/30 group-hover:shadow-[0_10px_28px_rgba(0,0,0,0.5),0_0_26px_rgba(34,197,94,0.18)]">
        <div className="relative aspect-video w-full overflow-hidden">
          {/* Continue-watching tiles use landscape crops of the poster artwork */}
          <PosterBackdrop src={entry.poster} title={entry.title} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          <div className="absolute inset-0 grid place-items-center opacity-0 transition duration-200 group-hover:opacity-100">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-black shadow-[0_0_20px_rgba(34,197,94,0.45)] ring-2 ring-white/25 transition duration-200 group-hover:scale-110 group-hover:bg-brand-hover">
              <PlayIcon width={16} height={16} className="translate-x-px" />
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/15">
            <div className="h-full bg-brand shadow-[0_0_8px_rgba(34,197,94,0.6)]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <p className="mt-2 line-clamp-1 text-[13px] font-medium text-zinc-300 group-hover:text-white">
        {entry.mediaType === "series"
          ? `${entry.title} — S${entry.season} E${entry.episode}`
          : entry.title}
      </p>
    </Link>
  );
}

function PosterBackdrop({ src, title }: { src: string | null; title: string }) {
  if (!src) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-surface-2">
        <span className="text-lg font-black text-brand/50">{title.charAt(0)}</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    // Poster artwork center-cropped to landscape
    <img
      src={src}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      loading="lazy"
      decoding="async"
    />
  );
}
