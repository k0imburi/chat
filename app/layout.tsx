import type { Metadata, Viewport } from "next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { PwaRegister } from "@/components/pwa-register"

export const metadata: Metadata = {
  title: { default: "ChatAndTip", template: "%s · ChatAndTip" },
  description: "Connect with creators, discover original work, join conversations and manage your ChatAndTip account.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ChatAndTip",
  },
}

export const viewport: Viewport = {
  themeColor: "#25d366",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {/* Light-first: both the admin dashboard and the customer app now
            support light and dark. next-themes applies the class pre-paint,
            which stops the wrong base background from flashing behind pages
            on load/navigation. */}
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
          {children}
          <PwaRegister />
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
