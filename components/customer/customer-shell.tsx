import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { Bell, CalendarClock, Compass, FileText, Flame, Info, LifeBuoy, Megaphone, MessageCircle, PlusSquare, Search, ShieldCheck, UserRound } from "lucide-react"
import { MobileMenu } from "@/components/customer/mobile-menu"
import { ModeToggle } from "@/components/customer/mode-toggle"
import { LanguageSwitcher } from "@/components/customer/language-switcher"

const nav = [
  { href: "/", label: "Discover", icon: Compass },
  { href: "/inbox", label: "Chats", icon: MessageCircle },
  { href: "/create", label: "Create", icon: PlusSquare },
  { href: "/trending", label: "Trending", icon: Flame },
  { href: "/ads", label: "Ads", icon: Megaphone },
  { href: "/sessions", label: "Sessions", icon: CalendarClock },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/account", label: "Account", icon: UserRound },
]
const mobileNav = nav.filter((item) => ["/", "/inbox", "/trending", "/alerts", "/account"].includes(item.href))

// Secondary nav — same row treatment as the primary items above, just
// grouped below a divider (the TikTok web app pattern: About/Contact/Terms/
// Privacy get their own full menu rows, not small footer-style text links).
const secondaryNav = [
  { href: "/support", label: "Support", icon: LifeBuoy },
  { href: "/contact", label: "Contact Us", icon: LifeBuoy },
  { href: "/about", label: "About", icon: Info },
  { href: "/terms", label: "Terms", icon: FileText },
  { href: "/privacy", label: "Privacy", icon: ShieldCheck },
]

export function CustomerShell({
  active,
  signedIn,
  children,
  aside,
}: {
  active: string
  signedIn: boolean
  children: ReactNode
  aside?: ReactNode
}) {
  return (
    <main className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-black/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Link href="/search" aria-label="Search" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><Search className="h-5 w-5" /></Link>
            <div className="lg:hidden">
              <MobileMenu />
            </div>
            <Link href="/" className="flex items-center gap-2.5 font-extrabold">
              <Image src="/chatandtip-logo.jpg" alt="" width={54} height={34} className="h-9 w-14 object-contain" priority />
              <span>ChatAndTip</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ModeToggle />
            <Link href={signedIn ? "/account" : "/login"} className="rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-white">
              {signedIn ? "Account" : "Sign in"}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 pb-24 pt-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <aside className="sticky top-22 hidden h-fit space-y-2 lg:block">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold ${
                active === href
                  ? "bg-black/5 text-black dark:bg-white/10 dark:text-white"
                  : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
              }`}
            >
              <Icon className="h-5 w-5" />{label}
            </Link>
          ))}
          <div className="my-2 border-t border-black/10 dark:border-white/10" />
          {secondaryNav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold ${
                active === href
                  ? "bg-black/5 text-black dark:bg-white/10 dark:text-white"
                  : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
              }`}
            >
              <Icon className="h-5 w-5" />{label}
            </Link>
          ))}
        </aside>

        <section className="min-w-0">{children}</section>

        <aside className="sticky top-22 hidden h-fit lg:block">{aside ?? <AccountAside signedIn={signedIn} />}</aside>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl dark:border-white/10 dark:bg-black/95 lg:hidden">
        <div className="mx-auto flex max-w-lg justify-around">
          {mobileNav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex min-w-15 flex-col items-center gap-1 px-2 py-1 text-[10px] font-bold ${
                active === href ? "text-[#25d366]" : "text-black/50 dark:text-white/50"
              }`}
            >
              <Icon className="h-5 w-5" /><span className="sr-only max-w-18 truncate">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </main>
  )
}

function AccountAside({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-black/5 p-5 dark:border-white/10 dark:bg-white/5">
      <h2 className="font-extrabold">My ChatAndTip</h2>
      <p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">Manage your ChatAndTip account.</p>
      <Link href={signedIn ? "/account" : "/login"} className="mt-4 flex items-center justify-center rounded-2xl bg-black/10 px-4 py-3 text-sm font-bold text-black dark:bg-white/10 dark:text-white">
        {signedIn ? "Open account" : "Sign in to continue"}
      </Link>
    </div>
  )
}

export function SignInRequired({ title = "Sign in to continue", message = "Use your ChatAndTip account to see this app area." }: { title?: string; message?: string }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-black/5 p-8 text-center dark:border-white/10 dark:bg-white/5">
      <h1 className="text-2xl font-black">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-black/50 dark:text-white/50">{message}</p>
      <Link href="/login" className="mt-6 inline-flex rounded-full bg-[#25d366] px-5 py-3 text-sm font-extrabold text-white">Sign in</Link>
    </div>
  )
}
