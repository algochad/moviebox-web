"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PlayIcon, SearchIcon } from "@/components/icons";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Search" },
];

export function Nav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const immersive = pathname.startsWith("/watch");
  if (immersive) return null;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color] duration-150 ${
        scrolled
          ? "border-line bg-ink/85 backdrop-blur-md"
          : "border-transparent bg-gradient-to-b from-black/70 to-transparent"
      }`}
    >
      <nav className="mx-auto flex h-14 max-w-[1500px] items-center gap-6 px-5 md:h-16 md:px-10">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5"
          aria-label="MovieBox home"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand shadow-[0_0_16px_rgba(34,197,94,0.35)] transition duration-150 group-hover:bg-brand-hover group-hover:shadow-[0_0_22px_rgba(74,222,128,0.55)]">
            <PlayIcon width={13} height={13} className="translate-x-px text-black" />
          </span>
          <span className="flex items-center font-display text-[17px] font-extrabold lowercase tracking-tight text-white">
            moviebox
            <span aria-hidden="true" className="mb-0.5 ml-1 inline-block h-1.5 w-1.5 rounded-[2px] bg-brand" />
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors duration-150 after:absolute after:inset-x-3 after:-bottom-1 after:h-px after:bg-brand after:content-[''] ${
                  active
                    ? "text-brand"
                    : "text-zinc-400 after:opacity-0 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/search"
            aria-label="Search"
            className="grid h-9 w-9 place-items-center rounded-md border border-line text-zinc-200 transition-colors duration-150 hover:border-brand hover:text-white"
          >
            <SearchIcon width={17} height={17} />
          </Link>
        </div>
      </nav>
    </header>
  );
}
