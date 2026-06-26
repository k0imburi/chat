import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import {
  Bell,
  CalendarClock,
  Compass,
  Flame,
  MessageCircle,
  PlusSquare,
  UserRound,
} from "lucide-react"

const nav = [
  { href: "/", label: "Discover", icon: Compass },
  { href: "/inbox", label: "Chats", icon: MessageCircle },
  { href: "/create", label: "Create", icon: PlusSquare },
  { href: "/trending", label: "Trending", icon: Flame },
  { href: "/sessions", label: "Sessions", icon: CalendarClock },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/account", label: "Account", icon: UserRound },
]

export function FeedShell({
  active,
  signedIn,
  children,
}: {
  active: string
  signedIn: boolean
  children: ReactNode
}) {
  return (
    <div className="relative h-dvh overflow-hidden bg-black text-white">
      {/* Transparent header — floats over the video */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex h-14 items-center justify-between px-4">
        <Link href="/" className="pointer-events-auto flex items-center gap-2 font-extrabold drop-shadow-lg">
          <Image
            src="/chatandtip-logo.jpg"
            alt=""
            width={40}
            height={25}
            className="h-8 w-10 object-contain"
            priority
          />
          <span className="text-white">ChatAndTip</span>
        </Link>
        <Link
          href={signedIn ? "/account" : "/login"}
          className="pointer-events-auto rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold text-white backdrop-blur-sm"
        >
          {signedIn ? "Account" : "Sign in"}
        </Link>
      </header>

      {/* Full-screen snap-scroll area */}
      <div className="h-full">{children}</div>

      {/* Bottom nav — floats over the video */}
      <nav className="pointer-events-none absolute inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/70 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-md">
        <div className="pointer-events-auto mx-auto flex max-w-lg justify-around px-2">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex min-w-[52px] flex-col items-center gap-1 px-2 py-1 text-[10px] font-bold transition-colors ${
                active === href ? "text-white" : "text-white/45"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
