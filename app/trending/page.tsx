import { FeedShell } from "@/components/customer/feed-shell"
import { FullScreenFeed } from "@/components/customer/full-screen-feed"
import { getCurrentCustomerUser, getPublicFeed } from "@/lib/customer-web"

export default async function TrendingPage() {
  const [user, feed] = await Promise.all([getCurrentCustomerUser(), getPublicFeed("trending")])

  return (
    <FeedShell active="/trending" signedIn={Boolean(user)}>
      <FullScreenFeed entries={feed} viewerId={user?.userId} />
    </FeedShell>
  )
}
