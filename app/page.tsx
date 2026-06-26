import Link from "next/link"
import { FeedList } from "@/components/customer/media-card"
import { CustomerShell } from "@/components/customer/customer-shell"
import { getCurrentCustomerUser, getCustomerHomeFeed } from "@/lib/customer-web"

export default async function HomePage() {
  const user = await getCurrentCustomerUser()
  const feed = await getCustomerHomeFeed(user?.userId)

  return (
    <CustomerShell active="/" signedIn={Boolean(user)}>
      <div className="mb-6 overflow-hidden rounded-3xl bg-neutral-950 px-6 py-8 text-white shadow-xl sm:px-10">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-400">Discover</p>
        <h1 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-5xl">Find creators, posts and conversations.</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-white/65 sm:text-base">Browse original posts, open exact shared reels, and manage your account from the web app.</p>
        {!user ? <Link href="/login" className="mt-7 inline-flex rounded-full bg-[#25d366] px-5 py-3 text-sm font-extrabold text-white">Sign in for your personalized feed</Link> : null}
      </div>
      <FeedList entries={feed} empty="No posts are available yet." />
    </CustomerShell>
  )
}
