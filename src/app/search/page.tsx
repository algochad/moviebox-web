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
    <div className="mx-auto min-h-screen w-full max-w-[1560px] px-5 pb-28 pt-24 md:px-8 md:pt-28 xl:px-12">
      {/* ---------- Search head ---------- */}
      <div className="animate-fade-up">
        <p className="eyebrow mb-3 flex items-center gap-2">
          <span className="h-px w-5 bg-brand" />
          Catalog Search
        </p>
        <h1 className="display-title text-[clamp(2rem,4vw,3.25rem)]">Search</h1>

        <div className="relative mt-7 max-w-3xl">
          {/* Terminal-style query bar */}
          <div className="glass-panel flex items-center gap-3 rounded-lg px-4 py-3.5 transition duration-200 focus-within:border-brand/40 focus-within:shadow-[0_0_0_3px_rgba(34,197,94,0.1),0_0_24px_rgba(34,197,94,0.06)]">
            <SearchIcon width={18} height={18} className="shrink-0 text-brand" />
            <span className="mono-meta shrink-0 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-600">
              {">"}
            </span>
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
              placeholder="SEARCH CATALOG"
              className="mono-meta w-full bg-transparent text-[15px] text-white placeholder-zinc-500 outline-none"
              autoComplete="off"
              spellCheck={false}
              aria-label="Search catalog"
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
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] border border-line text-zinc-400 transition hover:border-brand/40 hover:bg-white/5 hover:text-brand"
              >
                <XIcon width={15} height={15} />
              </button>
            )}
            <button
              onClick={() => submit()}
              disabled={searching}
              className="btn-solid mono-meta shrink-0 px-5 py-2 text-[12px] font-bold uppercase tracking-[0.14em] disabled:cursor-default disabled:opacity-60"
            >
              {searching ? "Querying…" : "Search"}
            </button>
          </div>

          {/* Suggestions — mono rows with a left tick on the active one */}
          {showSuggest && (
            <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-line bg-raised/95 shadow-[0_18px_50px_rgba(0,0,0,0.7)] backdrop-blur">
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => {
                    setQuery(s);
                    submit(s);
                  }}
                  className={`relative flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition duration-150 ${
                    i === highlight ? "bg-brand/10 font-semibold text-brand" : "text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-brand transition-opacity duration-150 ${
                      i === highlight ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <SearchIcon
                    width={13}
                    height={13}
                    className={i === highlight ? "text-brand" : "text-zinc-500"}
                  />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Provider chips */}
        <div className="mt-5 flex items-center gap-2">
          <span className="mono-meta text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">
            Source:
          </span>
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => switchProvider(p.id)}
              aria-pressed={provider === p.id}
              className={`mono-meta text-[11px] uppercase tracking-[0.1em] transition duration-150 ${
                provider === p.id
                  ? "rounded-[4px] bg-brand px-3 py-1.5 font-bold text-black shadow-[0_0_14px_rgba(34,197,94,0.25)]"
                  : "rounded-[4px] border border-line bg-white/[0.03] px-3 py-1.5 font-semibold text-zinc-400 hover:border-brand/40 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Results ---------- */}
      {error && (
        <div className="mt-10 max-w-3xl rounded-lg border border-line bg-surface/60 p-6 text-center">
          <p className="mono-meta text-[11px] font-bold uppercase tracking-[0.24em] text-brand">
            // Query Failed
          </p>
          <p className="mt-2 text-sm text-zinc-300">Search failed on this source.</p>
          <p className="mt-1 font-mono text-xs text-zinc-500">{error}</p>
          <button
            onClick={() => state && runSearch(state.query, provider, 1, false)}
            className="btn-solid mono-meta mt-4 px-5 py-2 text-[12px] font-bold uppercase tracking-[0.14em]"
          >
            Retry
          </button>
        </div>
      )}

      {searching && (
        <div className="mt-12 grid grid-cols-3 gap-3.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3] rounded-lg" />
          ))}
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="animate-fade-in mt-10">
          <p className="hairline-b mono-meta mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-3 text-[12px] uppercase tracking-[0.14em] text-zinc-500">
            <span className="font-bold text-brand">
              {results.length} {results.length === 1 ? "Result" : "Results"}
            </span>
            <span className="text-zinc-400">for “{state?.query}”</span>
            {state && state.total > results.length && (
              <span className="text-zinc-600">+ more available</span>
            )}
          </p>
          <div className="grid grid-cols-3 gap-3.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
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
                className="btn-glass mono-meta px-6 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50"
              >
                {loadingMore ? (
                  <Spinner width={15} height={15} className="animate-spin" />
                ) : (
                  <ChevronRight width={15} height={15} className="rotate-90" />
                )}
                Load more
              </button>
            </div>
          )}
        </div>
      )}

      {!searching && !error && state && results.length === 0 && (
        <div className="mt-20 text-center">
          <p className="mono-meta text-[11px] font-bold tracking-[0.3em] text-brand">// NO MATCH</p>
          <p className="mt-4 font-mono text-sm text-zinc-400">
            ZERO RESULTS FOR “{state.query.toUpperCase()}” ON{" "}
            <span className="text-brand">{(PROVIDERS.find((p) => p.id === provider)?.label ?? provider).toUpperCase()}</span>
          </p>
          <p className="mt-2 font-mono text-xs text-zinc-600">
            TRY A DIFFERENT TITLE OR SWITCH SOURCES ABOVE.
          </p>
        </div>
      )}

      {!searching && !state && !error && (
        <div className="mt-24 text-center">
          <p className="mono-meta text-[11px] font-bold tracking-[0.3em] text-zinc-600">
            // AWAITING QUERY
          </p>
          <p className="mx-auto mt-4 max-w-md font-mono text-[13px] leading-relaxed text-zinc-500">
            Type to search movies and series across your MovieBox backend, then press{" "}
            <kbd className="rounded-[4px] border border-line bg-surface px-1.5 py-0.5 text-[11px] text-zinc-300">
              ENTER
            </kbd>{" "}
            or pick a suggestion.
          </p>
        </div>
      )}
    </div>
  );
}
