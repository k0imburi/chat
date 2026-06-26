import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { Bell, CalendarClock, Compass, Flame, MessageCircle, PlusSquare, UserRound, WalletCards } from "lucide-react"

const nav = [
  { href: "/", label: "Discover", icon: Compass },
  { href: "/inbox", label: "Chats", icon: MessageCircle },
  { href: "/create", label: "Create", icon: PlusSquare },
  { href: "/trending", label: "Trending", icon: Flame },
  { href: "/sessions", label: "Sessions", icon: CalendarClock },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/account", label: "Account", icon: UserRound },
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
    <main className="min-h-screen bg-[#f7faf8] text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-extrabold">
            <Image src="/chatandtip-logo-v2.png" alt="" width={34} height={34} className="rounded-full" priority />
            <span>ChatAndTip</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/wallet" className="hidden items-center gap-2 rounded-full border border-emerald-200 px-4 py-2 text-sm font-bold text-emerald-700 sm:flex">
              <WalletCards className="h-4 w-4" /> Wallet
            </Link>
            <Link href={signedIn ? "/account" : "/login"} className="rounded-full bg-[#25d366] px-4 py-2 text-sm font-bold text-white">
              {signedIn ? "Account" : "Sign in"}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 pb-24 pt-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <aside className="sticky top-22 hidden h-fit space-y-2 lg:block">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold ${active === href ? "bg-emerald-100 text-emerald-800" : "text-neutral-600 hover:bg-white"}`}>
              <Icon className="h-5 w-5" />{label}
            </Link>
          ))}
        </aside>

        <section className="min-w-0">{children}</section>

        <aside className="sticky top-22 hidden h-fit lg:block">{aside ?? <WalletAside signedIn={signedIn} />}</aside>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-lg justify-around">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`flex min-w-15 flex-col items-center gap-1 px-2 py-1 text-[10px] font-bold ${active === href ? "text-emerald-600" : "text-neutral-500"}`}>
              <Icon className="h-5 w-5" /><span className="max-w-18 truncate">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </main>
  )
}

function WalletAside({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
      <h2 className="font-extrabold">My ChatAndTip</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-500">View balances, account activity, KYC and secure web top-ups with M-PESA.</p>
      <Link href={signedIn ? "/wallet" : "/login"} className="mt-4 flex items-center justify-center rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-bold text-white">
        {signedIn ? "Open wallet" : "Sign in to continue"}
      </Link>
    </div>
  )
}

export function SignInRequired({ title = "Sign in to continue", message = "Use your ChatAndTip account to see this app area." }: { title?: string; message?: string }) {
  return (
    <div className="rounded-3xl border border-black/5 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-black">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-500">{message}</p>
      <Link href="/login" className="mt-6 inline-flex rounded-full bg-[#25d366] px-5 py-3 text-sm font-extrabold text-white">Sign in</Link>
    </div>
  )
}
