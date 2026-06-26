import { Flame } from "lucide-react"
import { PostGrid } from "@/components/customer/post-grid"
import { CustomerShell } from "@/components/customer/customer-shell"
import { getCurrentCustomerUser, getPublicFeed } from "@/lib/customer-web"

export default async function TrendingPage() {
  const [user, feed] = await Promise.all([getCurrentCustomerUser(), getPublicFeed("trending")])

  return (
    <CustomerShell active="/trending" signedIn={Boolean(user)}>
      <div className="mb-4 flex items-center gap-2">
        <Flame className="h-5 w-5 text-orange-500" />
        <div>
          <h1 className="text-lg font-black leading-none">Trending</h1>
          <p className="mt-0.5 text-xs text-neutral-500">Ranked by likes, comments, views and freshness</p>
        </div>
      </div>
      <PostGrid entries={feed} empty="No trending posts are available yet." />
    </CustomerShell>
  )
}
