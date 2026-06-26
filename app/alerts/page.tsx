import Link from "next/link"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { getCurrentCustomerUser, getCustomerNotifications, mediaTargetFromNotification } from "@/lib/customer-web"

export default async function NotificationsPage() {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/alerts" signedIn={false}><SignInRequired title="Sign in to see alerts" /></CustomerShell>
  const notifications = await getCustomerNotifications(user.userId)

  return (
    <CustomerShell active="/alerts" signedIn>
      <div className="rounded-3xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-black/5 p-5">
          <h1 className="text-2xl font-black">Alerts</h1>
          <p className="mt-1 text-sm text-neutral-500">Likes, comments, broadcasts and booking updates open their exact destination when available.</p>
        </div>
        <div className="divide-y divide-black/5">
          {notifications.data.map((item) => {
            const href = mediaTargetFromNotification(item.metadata) || (item.type === "broadcast" ? "/inbox" : "/")
            return (
              <Link key={item.id} href={href} className={`block p-5 hover:bg-neutral-50 ${item.isRead ? "" : "bg-emerald-50/60"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-extrabold">{item.title || notificationTitle(item.type)}</p>
                    <p className="mt-1 text-sm leading-6 text-neutral-600">{item.message}</p>
                    <p className="mt-2 text-xs text-neutral-400">{new Date(item.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p>
                  </div>
                  {!item.isRead ? <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500" /> : null}
                </div>
              </Link>
            )
          })}
          {!notifications.data.length ? <p className="p-8 text-center text-sm text-neutral-500">No alerts yet.</p> : null}
        </div>
      </div>
    </CustomerShell>
  )
}

function notificationTitle(type: string) {
  if (type === "broadcast") return "ChatAndTip"
  if (type === "comment") return "New comment"
  if (type === "like") return "New like"
  if (type === "booking") return "Booking update"
  return "Alert"
}
