"use client";

import Link from "next/link";
import { useState } from "react";
import { Cover } from "@/components/cover";
import {
  CalendarIcon,
  ChevronDown,
  InfoIcon,
  PlayIcon,
  StarIcon,
} from "@/components/icons";
import { formatRuntime } from "@/lib/format";
import type { MediaDetails, ProviderId, Season } from "@/lib/types";

export function TitleDetail({ details }: { details: MediaDetails }) {
  const [seasonIdx, setSeasonIdx] = useState(0);
  const seasons = details.seasons;
  const activeSeason: Season | null = seasons[seasonIdx] ?? null;
  const isSeries = details.media_type === "series" || seasons.length > 0;
  const runtime = formatRuntime(details.duration);
  const episodeCount = seasons.reduce((n, s) => n + s.episodes.length, 0);

  const watchHref = (season: number, episode: number) =>
    `/watch/${details.id.provider}/${details.id.value}${
      isSeries ? `?s=${season}&e=${episode}` : ""
    }`;

  const startHref = watchHref(activeSeason?.number ?? 0, activeSeason?.episodes[0]?.number ?? 0);

  return (
    <div className="pb-24">
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 scale-110">
          <Cover
            src={details.poster_url}
            alt=""
            className="object-cover blur-3xl opacity-40"
            sizes="100vw"
            priority
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/40 to-transparent" />

        <div className="relative z-10 mx-auto flex max-w-[1500px] flex-col gap-8 px-5 pb-10 pt-24 md:flex-row md:items-end md:px-10 md:pt-32">
          {/* Poster */}
          <div className="animate-fade-up w-44 shrink-0 overflow-hidden rounded-xl shadow-2xl shadow-black/60 ring-1 ring-white/10 sm:w-56 md:w-64">
            <div className="aspect-[2/3] w-full">
              <Cover src={details.poster_url} alt={details.title} sizes="260px" priority />
            </div>
          </div>

          {/* Info */}
          <div className="animate-fade-up flex-1 space-y-4">
            <h1 className="text-balance text-3xl font-black tracking-tight text-white sm:text-5xl">
              {details.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-300">
              {details.imdb_rating && (
                <span className="flex items-center gap-1 font-semibold text-amber-400">
                  <StarIcon width={15} height={15} /> {details.imdb_rating}
                </span>
              )}
              {details.year && (
                <span className="flex items-center gap-1">
                  <CalendarIcon width={14} height={14} className="text-zinc-500" />
                  {details.year}
                </span>
              )}
              {runtime && <span>{runtime}</span>}
              {isSeries && (
                <span className="rounded border border-brand/25 bg-brand/10 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-brand">
                  {episodeCount} Episodes
                </span>
              )}
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                <ProviderDot provider={details.id.provider} /> {providerLabel(details.id.provider)}
              </span>
            </div>

            {details.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {details.genres.slice(0, 5).map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-200 backdrop-blur"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {details.tagline && (
              <p className="text-sm font-medium italic text-zinc-400">“{details.tagline}”</p>
            )}
            <p className="max-w-3xl text-[15px] leading-relaxed text-zinc-200">
              {details.description || "No synopsis available for this title yet."}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href={startHref}
                className="flex items-center gap-2.5 rounded-xl bg-brand px-7 py-3 text-lg font-bold text-black shadow-[0_10px_30px_rgba(0,0,0,0.45),0_0_28px_rgba(34,197,94,0.25)] transition duration-200 hover:bg-brand-hover hover:shadow-[0_0_38px_rgba(74,222,128,0.45)] active:scale-[0.98]"
              >
                <PlayIcon width={20} height={20} className="translate-x-px" />
                {isSeries ? "Start Watching" : "Play"}
              </Link>
              <button className="flex items-center gap-2.5 rounded-xl bg-white/10 px-5 py-3 text-lg font-semibold text-white ring-1 ring-white/15 backdrop-blur transition duration-200 hover:bg-white/20 hover:ring-white/25">
                <InfoIcon width={20} height={20} />
                Details
              </button>
            </div>

            {details.stars && (
              <p className="max-w-3xl text-sm text-zinc-400">
                <span className="font-semibold text-zinc-300">Cast: </span>
                {details.stars}
              </p>
            )}
            {details.director && (
              <p className="text-sm text-zinc-400">
                <span className="font-semibold text-zinc-300">Director: </span>
                {details.director}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---------- Episodes ---------- */}
      {isSeries && seasons.length > 0 && (
        <section className="mx-auto mt-10 max-w-[1500px] px-5 md:px-10">
          <div className="mb-5 flex items-center gap-4">
            <h2 className="text-xl font-bold tracking-tight text-white">Episodes</h2>
            {seasons.length > 1 && (
              <SeasonPicker seasons={seasons} value={seasonIdx} onChange={setSeasonIdx} />
            )}
          </div>

          <ol className="space-y-2">
            {activeSeason?.episodes.map((ep, i) => (
              <li key={`${ep.season}-${ep.number}`}>
                <Link
                  href={watchHref(ep.season, ep.number)}
                  className="group flex items-center gap-4 rounded-xl p-3 transition duration-200 hover:-translate-y-0.5 hover:bg-brand/[0.08] hover:shadow-[0_6px_22px_rgba(0,0,0,0.35)]"
                >
                  <span className="w-9 shrink-0 text-right font-mono text-lg font-bold text-zinc-500 transition duration-200 group-hover:text-brand">
                    {ep.number}
                  </span>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-white transition duration-200 group-hover:border-brand group-hover:bg-brand group-hover:text-black group-hover:shadow-[0_0_16px_rgba(34,197,94,0.45)]">
                    <PlayIcon width={16} height={16} className="translate-x-0.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-zinc-100 group-hover:text-white">
                      {ep.title ?? `Episode ${ep.number}`}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {String(ep.season).padStart(2, "0")} · {String(ep.number).padStart(2, "0")}
                    </span>
                  </span>
                  <ChevronRightSmall />
                </Link>
                {i < (activeSeason?.episodes.length ?? 0) - 1 && (
                  <div className="ml-[92px] border-t border-white/5" />
                )}
              </li>
            ))}
            {activeSeason?.episodes.length === 0 && (
              <p className="py-8 text-center text-zinc-500">Episode list unavailable for this season.</p>
            )}
          </ol>
        </section>
      )}

      {/* ---------- Audio languages ---------- */}
      {details.dubs.length > 1 && (
        <section className="mx-auto mt-10 max-w-[1500px] px-5 md:px-10">
          <h2 className="mb-3 text-lg font-bold tracking-tight text-white">Audio</h2>
          <div className="flex flex-wrap gap-2">
            {details.dubs.map((dub) => (
              <span
                key={dub.subject_id}
                className="rounded-full border border-white/10 bg-surface px-3 py-1.5 text-xs font-medium text-zinc-300"
              >
                {dub.language}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ChevronRightSmall() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0 text-zinc-600 transition duration-200 group-hover:text-brand"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function ProviderDot({ provider }: { provider: ProviderId }) {
  const on = provider !== "fourkhdhub" && !provider.startsWith("bdix");
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${on ? "bg-emerald-400" : "bg-zinc-500"}`} />
  );
}

function providerLabel(p: ProviderId): string {
  switch (p) {
    case "moviebox":
      return "MovieBox";
    case "fourkhdhub":
      return "4KHDHub";
    case "bdix_circleftp":
      return "BDIX CircleFTP";
    case "bdix_dhakaflix":
      return "BDIX DhakaFlix";
    default:
      return "Addon";
  }
}

function SeasonPicker({
  seasons,
  value,
  onChange,
}: {
  seasons: Season[];
  value: number;
  onChange: (i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = seasons[value];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-white/15 bg-surface px-4 py-2 text-sm font-semibold text-white transition duration-200 hover:border-brand/40 hover:bg-surface-2"
      >
        Season {current?.number}
        <ChevronDown width={15} height={15} className={`transition duration-200 ${open ? "rotate-180 text-brand" : ""}`} />
      </button>
      {open && (
        <>
          <button
            aria-label="Close season picker"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-white/10 bg-surface-2 p-1 shadow-2xl shadow-black/70">
            {seasons.map((s, i) => (
              <button
                key={s.number}
                onClick={() => {
                  onChange(i);
                  setOpen(false);
                }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition duration-150 ${
                  i === value
                    ? "bg-brand/10 font-bold text-brand"
                    : "text-zinc-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                Season {s.number}
                <span className="ml-2 text-xs font-normal text-zinc-500">{s.episodes.length} eps</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
