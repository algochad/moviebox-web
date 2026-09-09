import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MovieBox — Stream movies & series",
    template: "%s · MovieBox",
  },
  description:
    "Self-hosted streaming platform: browse and watch movies and series through your own MovieBox backend.",
};

export const viewport: Viewport = {
  themeColor: "#0c0c0d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-ink font-sans text-[#f2f2f2] antialiased">
        <Nav />
        <main className="min-h-screen">{children}</main>
        <footer className="border-t border-line py-10">
          <div className="mx-auto max-w-[1500px] px-5 text-xs leading-relaxed text-[#6e6e74] md:px-10">
            <p className="mb-2 font-semibold text-brand">
              MovieBox <span className="text-[#f2f2f2]">Web</span>
            </p>
            <p>
              An independent client for publicly available streams. This project does not host or
              store any media, and streams are resolved from third-party sources. Users are
              responsible for complying with the laws of their country.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
