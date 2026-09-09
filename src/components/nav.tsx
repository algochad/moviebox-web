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
        scrolled || immersive
          ? "bg-ink/90 backdrop-blur-md border-b border-line"
          : "bg-gradient-to-b from-black/70 to-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-[1500px] items-center gap-8 px-5 md:px-10">
        <Link href="/" className="group flex shrink-0 items-center gap-2" aria-label="MovieBox home">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand transition group-hover:bg-brand-hover">
            <PlayIcon width={15} height={15} className="translate-x-px text-white" />
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
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-zinc-300 hover:bg-white/5 hover:text-white"
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
