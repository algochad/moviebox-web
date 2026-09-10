"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Cover } from "@/components/cover";
import { PlayIcon, XIcon } from "@/components/icons";
import type { WatchEntry } from "@/lib/account";
import { formatClock } from "@/lib/format";
import { useServerHistory, useSession } from "@/lib/session";

function watchHref(entry: WatchEntry): string {
  const base = `/watch/${entry.provider}/${entry.id}`;
  return entry.mediaType === "series" ? `${base}?s=${entry.season}&e=${entry.episode}` : base;
}

function entryMeta(entry: WatchEntry): string {
  const episode =
    entry.mediaType === "series"
      ? `S${String(entry.season).padStart(2, "0")}E${String(entry.episode).padStart(2, "0")}`
      : "Movie";
  return entry.year ? `${episode} · ${entry.year}` : episode;
}

function HistoryRow({ entry, onRemove }: { entry: WatchEntry; onRemove: () => void }) {
  const percent =
    entry.duration > 0 ? Math.min(100, Math.max(0, (entry.position / entry.duration) * 100)) : 0;
  return (
    <div className="glass-panel group flex gap-4 rounded-lg p-3 transition duration-200 hover:border-brand/30">
      <Link
        href={watchHref(entry)}
        className="relative block h-[118px] w-[79px] shrink-0 overflow-hidden rounded-md bg-surface"
        aria-label={entry.title}
      >
        <Cover src={entry.poster} alt={entry.title} sizes="79px" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={watchHref(entry)}
              className="block truncate text-[15px] font-semibold text-white transition hover:text-brand"
            >
              {entry.title}
            </Link>
            <p className="mono-meta mt-1 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              {entryMeta(entry)}
            </p>
          </div>
          <button
            type="button"
            aria-label={`Remove ${entry.title} from history`}
            onClick={onRemove}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] border border-line text-zinc-500 transition duration-150 hover:border-zinc-400/60 hover:text-white"
          >
            <XIcon width={13} height={13} />
          </button>
        </div>

        <div className="mt-auto pt-4">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="mono-meta text-[10px] tabular-nums text-zinc-500">
              {formatClock(entry.position)} / {entry.duration > 0 ? formatClock(entry.duration) : "--:--"}
            </span>
            <Link
              href={watchHref(entry)}
              className="btn-solid mono-meta gap-1.5 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
            >
              <PlayIcon width={10} height={10} className="translate-x-px" />
              Resume
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const { status } = useSession();
  const { entries, ready, remove } = useServerHistory();

  const sorted = useMemo(() => [...entries].sort((a, b) => b.updatedAt - a.updatedAt), [entries]);

  return (
    <div className="mx-auto w-full max-w-[860px] px-5 pb-28 pt-28 md:px-8">
      <p className="eyebrow">// Account</p>
      <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
        <h1 className="display-title text-4xl">History</h1>
        {ready && sorted.length > 0 && (
          <span className="mono-meta pb-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {String(sorted.length).padStart(2, "0")} titles
          </span>
        )}
      </div>

      {!ready ? (
        <div className="mt-10 space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="skeleton h-[142px] w-full rounded-lg" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="glass-panel mt-10 rounded-lg px-6 py-16 text-center">
          <p className="mono-meta text-[11px] font-bold uppercase tracking-[0.22em] text-brand">
            // Nothing watched yet — play something and it lands here
          </p>
          {status === "anon" && (
            <p className="mt-4 text-sm text-zinc-400">
              <Link href="/login" className="text-brand transition hover:text-brand-hover">
                Sign in
              </Link>{" "}
              to sync watch progress across devices.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-10 space-y-3">
          {sorted.map((entry) => (
            <HistoryRow
              key={`${entry.provider}:${entry.id}:${entry.season}:${entry.episode}`}
              entry={entry}
              onRemove={() => void remove(entry.provider, entry.id, entry.season, entry.episode)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
