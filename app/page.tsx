import Link from "next/link"
import { Compass } from "lucide-react"
import { PostGrid } from "@/components/customer/post-grid"
import { CustomerShell } from "@/components/customer/customer-shell"
import { getCurrentCustomerUser, getCustomerHomeFeed } from "@/lib/customer-web"

export default async function HomePage() {
  const user = await getCurrentCustomerUser()
  const feed = await getCustomerHomeFeed(user?.userId)

  return (
    <CustomerShell active="/" signedIn={Boolean(user)}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-emerald-600" />
          <h1 className="text-lg font-black">Discover</h1>
        </div>
        {!user && (
          <Link
            href="/login"
            className="rounded-full bg-[#25d366] px-4 py-2 text-xs font-extrabold text-white"
          >
            Sign in
          </Link>
        )}
      </div>
      <PostGrid entries={feed} empty="No posts are available yet." />
    </CustomerShell>
  )
}
