import { getCurrentCustomerUser } from "@/lib/customer-web"
import { FeedShell } from "@/components/customer/feed-shell"
import { AdsCenter } from "@/components/customer/ads-center"

export default async function AdsPage() {
  const user = await getCurrentCustomerUser()
  return (
    <FeedShell active="/ads" signedIn={Boolean(user)}>
      {user ? <AdsCenter /> : <div className="flex h-full items-center justify-center p-8 text-center"><p className="text-sm text-white/60">Sign in to manage your ads.</p></div>}
    </FeedShell>
  )
}
