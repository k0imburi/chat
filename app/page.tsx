import { FeedShell } from "@/components/customer/feed-shell"
import { FullScreenFeed } from "@/components/customer/full-screen-feed"
import { getCurrentCustomerUser, getCustomerHomeFeed } from "@/lib/customer-web"

export default async function HomePage() {
  const user = await getCurrentCustomerUser()
  const feed = await getCustomerHomeFeed(user?.userId)

  return (
    <FeedShell active="/" signedIn={Boolean(user)}>
      <FullScreenFeed entries={feed} viewerId={user?.userId} />
    </FeedShell>
  )
}
