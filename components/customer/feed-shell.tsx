import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import {
  Bell,
  CalendarClock,
  Compass,
  FileText,
  Flame,
  Info,
  LifeBuoy,
  MessageCircle,
  PlusSquare,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import { MobileMenu } from "@/components/customer/mobile-menu"
import { ModeToggle } from "@/components/customer/mode-toggle"

const nav = [
  { href: "/", label: "Discover", icon: Compass },
  { href: "/inbox", label: "Chats", icon: MessageCircle },
  { href: "/create", label: "Create", icon: PlusSquare },
  { href: "/trending", label: "Trending", icon: Flame },
  { href: "/sessions", label: "Sessions", icon: CalendarClock },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/account", label: "Account", icon: UserRound },
]

// Secondary nav — same row treatment as the primary items above, just
// grouped below a divider (the TikTok web app pattern: About/Contact/Terms/
// Privacy get their own full menu rows, not small footer-style text links).
const secondaryNav = [
  { href: "/contact", label: "Contact Us", icon: LifeBuoy },
  { href: "/about", label: "About", icon: Info },
  { href: "/terms", label: "Terms", icon: FileText },
  { href: "/privacy", label: "Privacy", icon: ShieldCheck },
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

      {/* ── Mobile-only floating header ──────────────────────────── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex h-14 items-center justify-between px-4 md:hidden">
        <div className="pointer-events-auto flex items-center gap-2">
          <MobileMenu variant="onDark" />
        </div>
        <Link href="/" className="pointer-events-auto flex items-center gap-2 font-extrabold drop-shadow-lg">
          <div className="overflow-hidden rounded-xl bg-white/90 px-1 py-0.5">
            <Image
              src="/chatandtip-logo.jpg"
              alt=""
              width={40}
              height={25}
              className="h-8 w-10 object-contain"
              priority
            />
          </div>
          <span className="text-white">ChatAndTip</span>
        </Link>
        <div className="pointer-events-auto flex items-center gap-2">
          <ModeToggle variant="onDark" />
          <Link
            href={signedIn ? "/account" : "/login"}
            className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold text-white backdrop-blur-sm"
          >
            {signedIn ? "Account" : "Sign in"}
          </Link>
        </div>
      </header>

      {/* ── Desktop-only floating top-right controls ─────────────────
          These used to sit at the bottom of the sidebar (mt-auto). Once the
          secondary nav (About/Terms/Privacy/Contact) was added the sidebar
          got tall enough that reaching sign-in or the theme toggle meant
          scrolling the whole menu, so they float here instead — always
          reachable, never pushed off-screen by menu length. */}
      <div className="pointer-events-none absolute right-6 top-5 z-40 hidden md:block">
        <div className="pointer-events-auto flex items-center gap-2">
          <ModeToggle variant="onDark" />
          <Link
            href={signedIn ? "/account" : "/login"}
            className="rounded-full border border-white/20 bg-black/40 px-5 py-2 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/10"
          >
            {signedIn ? "My Account" : "Sign in"}
          </Link>
        </div>
      </div>

      {/* ── Desktop layout: sidebar + feed column + right gutter ── */}
      <div className="flex h-full">

        {/* Desktop left sidebar */}
        <aside className="hidden md:flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-white/10 px-4 py-6 lg:w-72">
          {/* Logo */}
          <Link href="/" className="mb-8 flex items-center gap-2.5 font-extrabold">
            <div className="overflow-hidden rounded-xl bg-white/90 px-1 py-0.5">
              <Image
                src="/chatandtip-logo.jpg"
                alt=""
                width={40}
                height={25}
                className="h-8 w-10 object-contain"
                priority
              />
            </div>
            <span className="text-[17px] text-white">ChatAndTip</span>
          </Link>

          {/* Nav items */}
          <nav className="flex flex-col gap-1">
            {nav.map(({ href, label, icon: Icon }) => {
              const isActive = active === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3.5 rounded-xl px-4 py-3 text-[15px] font-bold transition-colors ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "text-white/50 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-[22px] w-[22px] stroke-2" />
                  {label}
                </Link>
              )
            })}
            <div className="my-2 border-t border-white/10" />
            {secondaryNav.map(({ href, label, icon: Icon }) => {
              const isActive = active === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3.5 rounded-xl px-4 py-3 text-[15px] font-bold transition-colors ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "text-white/50 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-[22px] w-[22px] stroke-2" />
                  {label}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Feed column — centered within the remaining space.
            h-full must be explicit so the child's h-full resolves correctly
            (a stretched flex item without an explicit height creates an
            indeterminate % baseline, collapsing the snap-scroll feed to 0). */}
        <div className="flex h-full flex-1 justify-center">
          <div className="relative h-full w-full max-w-[430px]">{children}</div>
        </div>

        {/* Right gutter — mirrors sidebar width so the feed is visually centered */}
        <div className="hidden md:block h-full w-60 shrink-0 lg:w-72" />
      </div>

      {/* ── Mobile-only bottom nav ────────────────────────────────── */}
      <nav className="pointer-events-none absolute inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/70 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-md md:hidden">
        <div className="pointer-events-auto mx-auto flex max-w-[430px] justify-around px-2">
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
