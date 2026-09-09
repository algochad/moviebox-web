"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ClapperIcon, PlayIcon, SearchIcon } from "@/components/icons";

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
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-ink/90 border-b border-brand/20 backdrop-blur-md"
          : "bg-gradient-to-b from-black/70 to-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-[1500px] items-center gap-8 px-5 md:px-10">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="MovieBox home">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand shadow-[0_0_14px_rgba(34,197,94,0.35)] transition duration-200 group-hover:bg-brand-hover group-hover:shadow-[0_0_20px_rgba(74,222,128,0.5)]">
            <PlayIcon width={14} height={14} className="translate-x-px text-black" />
          </span>
          <span className="text-[17px] font-black tracking-tight text-white">
            Movie<span className="text-brand">Box</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition duration-150 ${
                  active
                    ? "bg-brand/10 font-semibold text-brand"
                    : "text-zinc-300 hover:bg-brand/10 hover:text-brand"
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
            className="grid h-9 w-9 place-items-center rounded-full text-zinc-200 transition hover:bg-white/10 hover:text-white"
          >
            <SearchIcon width={19} height={19} />
          </Link>
        </div>
      </nav>
    </header>
  );
}
