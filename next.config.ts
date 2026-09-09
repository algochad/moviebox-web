import type { NextConfig } from "next";

const backend = process.env.MB_BACKEND_URL ?? "http://127.0.0.1:9797";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Resolves absolute URLs for metadata (favicon/OG) when the app is served
  // from anywhere; defaults to the dev URL at build time.
  metadataBase: new URL("http://localhost:3000"),
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async rewrites() {
    return [
      // JSON API of the Rust backend, kept out of the browser-visible
      // namespace under /api/mb/*.
      { source: "/api/mb/:path*", destination: `${backend}/api/:path*` },
      // Media proxy: browsers fetch every stream byte through this same
      // origin so Next can hand requests to the header-aware proxy. Range
      // requests pass through for seeking.
      { source: "/api/proxy/:ticket", destination: `${backend}/api/proxy/:ticket` },
      { source: "/api/proxy/:ticket/:path*", destination: `${backend}/api/proxy/:ticket/:path*` },
    ];
  },
};

export default nextConfig;
