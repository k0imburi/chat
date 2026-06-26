import Image from "next/image"
import Link from "next/link"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { getCurrentCustomerUser } from "@/lib/customer-web"

export default async function AccountPage() {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/account" signedIn={false}><SignInRequired /></CustomerShell>

  return (
    <CustomerShell active="/account" signedIn>
      <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 overflow-hidden rounded-full bg-neutral-100">
            {user.profileAvatarUrl ? <Image src={user.profileAvatarUrl} alt="" fill sizes="80px" className="object-cover" /> : null}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-black">{user.fullname || "Your account"}</h1>
            <p className="text-sm text-neutral-500">{user.email || user.phoneNumber || user.username}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Posts" value={user.gallery.length} />
          <Stat label="Followers" value={user.followersCount ?? 0} />
          <Stat label="Following" value={user.followingCount ?? 0} />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/wallet" className="rounded-2xl bg-neutral-950 px-4 py-4 text-center text-sm font-black text-white">Wallet & earnings</Link>
          <Link href={`/profiles/${user.userId}`} className="rounded-2xl border border-black/10 px-4 py-4 text-center text-sm font-black">View public profile</Link>
          <Link href="/account/edit" className="rounded-2xl border border-black/10 px-4 py-4 text-center text-sm font-black">Edit profile</Link>
          <Link href="/create" className="rounded-2xl border border-black/10 px-4 py-4 text-center text-sm font-black">Create post</Link>
        </div>
      </section>
    </CustomerShell>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-neutral-50 p-4 text-center"><p className="text-2xl font-black tabular-nums">{value.toLocaleString()}</p><p className="text-xs font-bold text-neutral-500">{label}</p></div>
}
