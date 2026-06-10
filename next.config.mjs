/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  // agora-access-token is a CJS-only package — tell Turbopack/webpack
  // to load it as a Node.js external instead of trying to bundle it.
  serverExternalPackages: ["agora-access-token"],
}

export default nextConfig
