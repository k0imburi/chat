import { FeedList } from "@/components/customer/media-card"
import { CustomerShell } from "@/components/customer/customer-shell"
import { getCurrentCustomerUser, getPublicFeed } from "@/lib/customer-web"

export default async function TrendingPage() {
  const [user, feed] = await Promise.all([getCurrentCustomerUser(), getPublicFeed("trending")])
  return (
    <CustomerShell active="/trending" signedIn={Boolean(user)}>
      <div className="mb-6 rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Trending</p>
        <h1 className="mt-2 text-3xl font-black">What people are engaging with</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500">Ranked by likes, comments, views and freshness.</p>
      </div>
      <FeedList entries={feed} empty="No trending posts are available yet." />
    </CustomerShell>
  )
}
