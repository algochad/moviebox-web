"use client";

import { useEffect, useRef, useState } from "react";
import { TitleCard } from "@/components/title-card";
import { ChevronRight, SearchIcon, Spinner, XIcon } from "@/components/icons";
import { api } from "@/lib/api";
import type { CatalogItem, ProviderId } from "@/lib/types";

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "moviebox", label: "MovieBox" },
  { id: "fourkhdhub", label: "4KHDHub" },
];

interface SearchState {
  query: string;
  provider: ProviderId;
  page: number;
  total: number;
  items: CatalogItem[];
  more: boolean;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [provider, setProvider] = useState<ProviderId>("moviebox");
  const [state, setState] = useState<SearchState | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<number | null>(null);
  const seenKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    debounce.current = window.setTimeout(async () => {
      try {
        const res = await api.suggest(q);
        setSuggestions(res.suggestions.slice(0, 8));
        setSuggestOpen(true);
        setHighlight(-1);
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [query]);

  const runSearch = async (q: string, prov: ProviderId, page: number, append: boolean) => {
    if (!q.trim()) return;
    if (append) setLoadingMore(true);
    else setSearching(true);
    setError(null);
    setSuggestOpen(false);
    try {
      const res = await api.search(q, prov, page);
      setState((prev) => {
        const items = append && prev ? [...prev.items, ...res.items] : res.items;
        return { query: q, provider: prov, page, total: items.length, items, more: res.items.length > 0 };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
      setLoadingMore(false);
    }
  };

  const submit = (value?: string) => {
    const q = (value ?? query).trim();
    if (!q) return;
    seenKeys.current.clear();
    void runSearch(q, provider, 1, false);
  };

  const switchProvider = (prov: ProviderId) => {
    setProvider(prov);
    if (state && state.query) {
      seenKeys.current.clear();
      void runSearch(state.query, prov, 1, false);
    }
  };

  const results = state?.items ?? [];
  const showSuggest = suggestOpen && suggestions.length > 0 && !searching;

  return (
    <div className="mx-auto min-h-screen max-w-[1500px] px-5 pb-24 pt-28 md:px-10">
      {/* ---------- Search head ---------- */}
      <div className="animate-fade-up">
        <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">Search</h1>
        <div className="relative mt-6">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-surface px-5 py-4 transition duration-200 focus-within:border-brand/40 focus-within:bg-surface-2 focus-within:shadow-[0_0_0_3px_rgba(34,197,94,0.12)]">
            <SearchIcon width={22} height={22} className="shrink-0 text-zinc-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit(showSuggest && highlight >= 0 ? suggestions[highlight] : undefined);
                else if (e.key === "ArrowDown" && showSuggest) {
                  e.preventDefault();
                  setHighlight((h) => Math.min(suggestions.length - 1, h + 1));
                } else if (e.key === "ArrowUp" && showSuggest) {
                  e.preventDefault();
                  setHighlight((h) => Math.max(0, h - 1));
                } else if (e.key === "Escape") {
                  setSuggestOpen(false);
                }
              }}
              placeholder="Titles, actors, genres…"
              className="w-full bg-transparent text-lg text-white placeholder-zinc-500 outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                aria-label="Clear"
                onClick={() => {
                  setQuery("");
                  setState(null);
                  setSuggestions([]);
                  setSuggestOpen(false);
                  inputRef.current?.focus();
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
              >
                <XIcon width={16} height={16} />
              </button>
            )}
            <button
              onClick={() => submit()}
              disabled={searching}
              className="shrink-0 rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-black shadow-[0_0_20px_rgba(34,197,94,0.2)] transition duration-200 hover:bg-brand-hover hover:shadow-[0_0_28px_rgba(74,222,128,0.35)] disabled:opacity-60"
            >
              Search
            </button>
          </div>

          {/* Suggestions */}
          {showSuggest && (
            <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl shadow-black/70">
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => {
                    setQuery(s);
                    submit(s);
                  }}
                  className={`flex w-full items-center gap-3 px-5 py-3 text-left text-sm transition duration-150 ${
                    i === highlight ? "bg-brand/10 font-semibold text-brand" : "text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  <SearchIcon width={14} height={14} className={i === highlight ? "text-brand" : "text-zinc-500"} />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Provider chips */}
        <div className="mt-5 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Sources</span>
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => switchProvider(p.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                provider === p.id
                  ? "bg-brand text-black shadow-[0_0_14px_rgba(34,197,94,0.25)]"
                  : "border border-white/15 text-zinc-300 hover:border-brand/40 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Results ---------- */}
      {error && (
        <div className="mt-10 rounded-2xl border border-white/10 bg-surface p-6 text-center">
          <p className="text-sm text-zinc-300">Search failed on this source.</p>
          <p className="mt-1 text-xs text-zinc-500">{error}</p>
          <button
            onClick={() => state && runSearch(state.query, provider, 1, false)}
            className="mt-4 rounded-xl bg-brand px-5 py-2 text-xs font-bold text-black transition duration-200 hover:bg-brand-hover"
          >
            Retry
          </button>
        </div>
      )}

      {searching && (
        <div className="mt-16 grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3] rounded-xl" />
          ))}
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="animate-fade-in mt-10">
          <p className="mb-5 text-sm text-zinc-400">
            <span className="font-bold text-brand">{results.length}</span> result{results.length === 1 ? "" : "s"} for{" "}
            <span className="font-semibold text-zinc-200">“{state?.query}”</span>
            {state && state.total > results.length ? " (more available)" : ""}
          </p>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {results.map((item) => {
              const key = `${item.id.provider}:${item.id.value}`;
              if (seenKeys.current.has(key)) return null;
              seenKeys.current.add(key);
              return <TitleCard key={key} item={item} />;
            })}
          </div>
          {state && state.more && (
            <div className="mt-10 flex justify-center">
              <button
                onClick={() => state && void runSearch(state.query, provider, state.page + 1, true)}
                disabled={loadingMore}
                className="flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white transition duration-200 hover:border-brand/50 hover:text-brand disabled:opacity-50"
              >
                {loadingMore ? (
                  <Spinner width={16} height={16} className="animate-spin" />
                ) : (
                  <ChevronRight width={16} height={16} className="rotate-90" />
                )}
                Load more
              </button>
            </div>
          )}
        </div>
      )}

      {!searching && !error && state && results.length === 0 && (
        <div className="mt-20 text-center">
          <p className="text-4xl">🎬</p>
          <p className="mt-4 text-lg font-semibold text-zinc-200">No matches on {PROVIDERS.find((p) => p.id === provider)?.label}</p>
          <p className="mt-1 text-sm text-zinc-500">Try a different title or switch sources above.</p>
        </div>
      )}

      {!searching && !state && !error && (
        <div className="mt-24 text-center">
          <p className="mx-auto max-w-md text-sm leading-relaxed text-zinc-500">
            Start typing to search movies and series across your MovieBox backend. Press{" "}
            <kbd className="rounded border border-white/20 bg-surface px-1.5 py-0.5 text-xs text-zinc-300">Enter</kbd>{" "}
            to search or pick a suggestion.
          </p>
        </div>
      )}
    </div>
  );
}
