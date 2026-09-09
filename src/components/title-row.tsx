"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { TitleCard } from "@/components/title-card";
import type { CatalogItem } from "@/lib/types";

export function RowSkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-6 w-48 rounded-md" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[2/3] w-[30%] shrink-0 rounded-xl sm:w-[19%] md:w-[15.5%] lg:w-[12%]" />
        ))}
      </div>
    </div>
  );
}

export function TitleRow({
  label,
  items,
  onMore,
  rankFrom,
}: {
  label: string;
  items: CatalogItem[];
  onMore?: () => void;
  rankFrom?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);
  const [hovering, setHovering] = useState(false);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows, items.length]);

  const scroll = useCallback((dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    const step = Math.max(240, (card?.offsetWidth ?? 160) * 4);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  if (!items.length) return null;

  return (
    <section
      className="group/row relative"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-lg font-bold tracking-tight text-zinc-50 md:text-xl">{label}</h2>
        {onMore && (
          <button
            onClick={onMore}
            className="text-xs font-medium text-zinc-400 transition hover:text-white"
          >
            See all →
          </button>
        )}
      </div>

      <div className="relative">
        {/* Edge fade for scroll hint */}
        {hovering && canLeft && (
          <button
            aria-label="Scroll back"
            onClick={() => scroll(-1)}
            className="absolute -left-3 top-0 z-20 flex h-full w-12 items-center justify-center rounded-r-xl bg-gradient-to-r from-ink via-ink/70 to-transparent text-white opacity-0 transition group-hover/row:opacity-100"
          >
            <ChevronLeft width={30} height={30} />
          </button>
        )}
        <div
          ref={trackRef}
          className="scrollbar-none flex gap-3 overflow-x-auto scroll-smooth pb-1"
          role="list"
        >
          {items.map((item, i) => (
            <div
              key={`${item.id.provider}:${item.id.value}`}
              data-card
              role="listitem"
              className={`w-[37%] shrink-0 sm:w-[24%] md:w-[19%] lg:w-[15.5%] xl:w-[12.8%] ${rankFrom != null ? "pl-1" : ""}`}
            >
              <TitleCard item={item} rank={rankFrom != null ? rankFrom + i : undefined} />
            </div>
          ))}
        </div>
        {hovering && canRight && (
          <button
            aria-label="Scroll forward"
            onClick={() => scroll(1)}
            className="absolute -right-3 top-0 z-20 flex h-full w-12 items-center justify-center rounded-l-xl bg-gradient-to-l from-ink via-ink/70 to-transparent text-white opacity-0 transition group-hover/row:opacity-100"
          >
            <ChevronRight width={30} height={30} />
          </button>
        )}
      </div>
    </section>
  );
}
