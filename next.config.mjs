/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  // agora-access-token is a CJS-only package — tell Turbopack/webpack
  // to load it as a Node.js external instead of trying to bundle it.
  serverExternalPackages: ["agora-access-token"],
  async headers() {
    const noStore = [
      {
        key: "Cache-Control",
        value: "no-store, no-cache, must-revalidate, max-age=0",
      },
      { key: "Pragma", value: "no-cache" },
      { key: "Expires", value: "0" },
    ]
    const revalidateStatic = noStore
    const cachedEngine = [
      {
        key: "Cache-Control",
        value: "public, max-age=604800, stale-while-revalidate=2592000",
      },
    ]
    return [
      { source: "/", headers: noStore },
      { source: "/flutter/index.html", headers: noStore },
      { source: "/flutter/:path*", headers: revalidateStatic },
      { source: "/flutter/main.dart.js", headers: noStore },
      { source: "/flutter/flutter_bootstrap.js", headers: noStore },
      { source: "/flutter/canvaskit/:path*", headers: cachedEngine },
      { source: "/flutter/assets/:path*", headers: cachedEngine },
    ]
  },
}

export default nextConfig
