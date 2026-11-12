import { FeedShell } from "@/components/customer/feed-shell"
import { FullScreenFeed } from "@/components/customer/full-screen-feed"
import { getCurrentCustomerUser, getCustomerTrendingFeed } from "@/lib/customer-web"

export default async function TrendingPage() {
  const user = await getCurrentCustomerUser()
  const feed = await getCustomerTrendingFeed(user?.userId)

  return (
    <FeedShell active="/trending" signedIn={Boolean(user)}>
      <FullScreenFeed entries={feed} viewerId={user?.userId} />
    </FeedShell>
  )
}
