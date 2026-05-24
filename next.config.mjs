/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["chatandtip.com", "www.chatandtip.com"],
    },
  },
}

export default nextConfig
