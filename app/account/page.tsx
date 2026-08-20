import Image from "next/image"
import Link from "next/link"
import { FileText, Info, LifeBuoy, ShieldCheck } from "lucide-react"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { getCurrentCustomerUser } from "@/lib/customer-web"

const legalLinks = [
  { href: "/about", label: "About", icon: Info },
  { href: "/terms", label: "Terms", icon: FileText },
  { href: "/privacy", label: "Privacy Policy", icon: ShieldCheck },
  { href: "/contact", label: "Contact Us", icon: LifeBuoy },
]

export default async function AccountPage() {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/account" signedIn={false}><SignInRequired /></CustomerShell>

  return (
    <CustomerShell active="/account" signedIn>
      <section className="rounded-3xl border border-black/10 bg-black/5 p-6 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            {user.profileAvatarUrl ? <Image src={user.profileAvatarUrl} alt="" fill sizes="80px" className="object-cover" /> : null}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-black">{user.fullname || "Your account"}</h1>
            <p className="text-sm text-black/50 dark:text-white/50">{user.email || user.phoneNumber || user.username}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Posts" value={user.gallery.length} />
          <Stat label="Followers" value={user.followersCount ?? 0} />
          <Stat label="Following" value={user.followingCount ?? 0} />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/wallet" className="rounded-2xl bg-[#25d366] px-4 py-4 text-center text-sm font-black text-white">Wallet & earnings</Link>
          <Link href={`/profiles/${user.userId}`} className="rounded-2xl border border-black/15 px-4 py-4 text-center text-sm font-black text-black dark:border-white/15 dark:text-white">View public profile</Link>
          <Link href="/account/edit" className="rounded-2xl border border-black/15 px-4 py-4 text-center text-sm font-black text-black dark:border-white/15 dark:text-white">Edit profile</Link>
          <Link href="/create" className="rounded-2xl border border-black/15 px-4 py-4 text-center text-sm font-black text-black dark:border-white/15 dark:text-white">Create post</Link>
        </div>
      </section>

      {/* Mobile-reachable path for the same menu items the desktop sidebar
          shows — the bottom tab bar is icon-only, so this is where a phone
          user finds About/Terms/Privacy/Contact. */}
      <section className="mt-4 overflow-hidden rounded-3xl border border-black/10 dark:border-white/10 lg:hidden">
        {legalLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 border-b border-black/10 px-4 py-3 text-sm font-bold text-black/70 last:border-b-0 hover:bg-black/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
          >
            <Icon className="h-5 w-5" />{label}
          </Link>
        ))}
      </section>
    </CustomerShell>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-black/5 p-4 text-center dark:bg-white/10"><p className="text-2xl font-black tabular-nums">{value.toLocaleString()}</p><p className="text-xs font-bold text-black/50 dark:text-white/50">{label}</p></div>
}
