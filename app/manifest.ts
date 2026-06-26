import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChatAndTip",
    short_name: "ChatAndTip",
    description: "Connect with creators, discover original work and join conversations.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7faf8",
    theme_color: "#25d366",
    orientation: "portrait-primary",
    icons: [
      { src: "/chatandtip-logo-v2.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
