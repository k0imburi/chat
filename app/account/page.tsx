import Image from "next/image"
import Link from "next/link"
import { BellRing, ChevronRight, Pencil, ShieldCheck, UserRound, UserX, WalletCards } from "lucide-react"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { VerifiedBadge } from "@/components/customer/verified-badge"
import { getCurrentCustomerUser } from "@/lib/customer-web"

const accountActions = [
  { href: "/account/edit", label: "Edit profile", description: "Profile details and account information", icon: Pencil },
  { href: "/wallet", label: "Wallet & earnings", description: "Balances, earnings and payouts", icon: WalletCards },
  { href: "/account/notifications", label: "Notifications", description: "Choose which activity alerts you receive", icon: BellRing },
  { href: "/account/verification", label: "Verification", description: "Review status and submit identity documents", icon: ShieldCheck },
  { href: "/account/blocked", label: "Blocked accounts", description: "Review and unblock accounts", icon: UserX },
]

export default async function AccountPage() {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/account" signedIn={false}><SignInRequired /></CustomerShell>

  return <CustomerShell active="/account" signedIn>
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-[#101312]">
        <div className="h-24 bg-[linear-gradient(115deg,#25d366,#14a44d_55%,#c21e55)]" />
        <div className="px-5 pb-6 sm:px-7">
          <div className="-mt-10 flex items-end justify-between gap-4">
            <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-neutral-100 shadow-md dark:border-[#101312] dark:bg-white/10">{user.profileAvatarUrl ? <Image src={user.profileAvatarUrl} alt="" fill sizes="80px" className="object-cover" /> : <UserRound className="absolute inset-0 m-auto h-8 w-8 text-black/20 dark:text-white/20" />}</div>
            <Link href="/account/edit" className="mb-1 rounded-full border border-black/15 px-4 py-2 text-xs font-extrabold dark:border-white/15">Edit profile</Link>
          </div>
          <div className="mt-3 flex items-center gap-1.5"><h1 className="truncate text-2xl font-black">{user.fullname || "Your account"}</h1><VerifiedBadge verified={user.verified} isBroadcaster={user.isBroadcaster} className="h-5 w-5" /></div>
          <p className="mt-0.5 text-sm text-black/45 dark:text-white/45">@{user.username}</p>
          <div className="mt-5 grid grid-cols-3 gap-2"><Stat label="Posts" value={user.gallery.length} /><Stat label="Followers" value={user.followersCount ?? 0} /><Stat label="Following" value={user.followingCount ?? 0} /></div>
          <Link href={`/profiles/${user.userId}`} className="mt-4 flex h-11 items-center justify-center rounded-xl bg-[#25d366] text-sm font-extrabold text-white">View public profile</Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-black/10 bg-white dark:border-white/10 dark:bg-[#101312]"><h2 className="px-5 pb-2 pt-5 text-xs font-black uppercase tracking-[0.16em] text-black/35 dark:text-white/35">Account controls</h2><div className="divide-y divide-black/[0.06] dark:divide-white/[0.07]">{accountActions.map(({ href, label, description, icon: Icon }) => <Link href={href} key={href} className="flex items-center gap-3.5 px-5 py-3.5 transition hover:bg-black/[0.025] dark:hover:bg-white/[0.035]"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#25d366]/10 text-[#16a653]"><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{label}</p><p className="mt-0.5 truncate text-xs text-black/40 dark:text-white/40">{description}</p></div><ChevronRight className="h-4 w-4 text-black/25 dark:text-white/25" /></Link>)}</div></section>
    </div>
  </CustomerShell>
}

function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-black/[0.035] p-3 text-center dark:bg-white/[0.055]"><p className="text-lg font-black tabular-nums">{value.toLocaleString()}</p><p className="text-[10px] font-bold uppercase tracking-wide text-black/40 dark:text-white/40">{label}</p></div> }
