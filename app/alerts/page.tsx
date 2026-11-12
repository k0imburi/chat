import Link from "next/link"
import { Bell, Check, MessageCircle } from "lucide-react"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { VerifiedBadge } from "@/components/customer/verified-badge"
import { getCurrentCustomerUser, getCustomerNotifications, mediaTargetFromNotification } from "@/lib/customer-web"

type UnknownRecord=Record<string,unknown>
const record=(value:unknown):UnknownRecord=>value&&typeof value==="object"&&!Array.isArray(value)?value as UnknownRecord:{}

export default async function NotificationsPage() {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/alerts" signedIn={false}><SignInRequired title="Sign in to see notifications" /></CustomerShell>
  const notifications = await getCustomerNotifications(user.userId)

  return (
    <CustomerShell active="/alerts" signedIn>
      <section className="overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-[0_18px_60px_rgba(0,0,0,.06)] dark:border-white/10 dark:bg-[#101312]">
        <header className="border-b border-black/[.07] px-5 py-5 dark:border-white/[.08]"><h1 className="text-xl font-black">Notifications</h1></header>
        <div className="divide-y divide-black/[.06] dark:divide-white/[.07]">
          {notifications.data.map(item=><NotificationRow key={item.id} item={item}/>) }
          {!notifications.data.length?<div className="px-6 py-20 text-center"><Bell className="mx-auto h-9 w-9 text-black/15 dark:text-white/15"/><p className="mt-3 text-sm font-semibold text-black/40 dark:text-white/40">No notifications yet.</p></div>:null}
        </div>
      </section>
    </CustomerShell>
  )
}

function NotificationRow({item}:{item:Awaited<ReturnType<typeof getCustomerNotifications>>["data"][number]}) {
  const metadata=record(item.metadata),sender=record(item.senderUser),grouped=Array.isArray(metadata.groupedActors)?metadata.groupedActors.map(record):[]
  const primary=grouped[0]?record(grouped[0].user):sender
  const avatar=String(primary.profileAvatarUrl||primary.avatarUrl||"")
  const name=String(primary.fullname||primary.fullName||primary.username||item.title||"ChatAndTip")
  const verified=Number(primary.verified||0),isBroadcaster=Boolean(primary.isBroadcaster),thumbnail=String(metadata.thumbnailUrl||"")
  const href=mediaTargetFromNotification(item.metadata)||(item.type==="broadcast"?"/inbox":item.type==="support_response"?"/support":"/")
  const isComment=["comment","comment_reply"].includes(item.type)
  return <Link href={href} className={`flex min-h-[82px] gap-3.5 px-5 py-3.5 transition hover:bg-black/[.025] dark:hover:bg-white/[.035] ${item.isRead?"":"bg-[#25d366]/[.08]"}`}>
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-black/[.06] ring-1 ring-black/[.05] dark:bg-white/10">{avatar?<img src={avatar} alt="" className="h-full w-full object-cover"/>:<img src="/chatandtip-logo.jpg" alt="" className="h-full w-full object-contain"/>}</div>
    <div className="min-w-0 flex-1"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold leading-5">{grouped.length?item.title:<><span className="font-extrabold">{name}</span><VerifiedBadge verified={verified} isBroadcaster={isBroadcaster} className="ml-1 inline h-4 w-4"/></>}</p>{!grouped.length&&!isComment&&item.message?<p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-black/52 dark:text-white/52">{notificationMessage(item.type,item.message)}</p>:null}</div><time className="shrink-0 text-[11px] font-semibold text-black/35 dark:text-white/35">{relativeTime(item.createdAt)}</time></div>{isComment&&item.message?<div className="mt-2 flex w-fit max-w-full items-start gap-1.5 rounded-xl bg-black/[.045] px-3 py-2 text-xs text-black/65 dark:bg-white/[.07] dark:text-white/65"><MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0"/><span className="line-clamp-2">{item.message}</span></div>:null}</div>
    <div className="flex shrink-0 items-center gap-2">{thumbnail?<div className="h-14 w-14 overflow-hidden rounded-lg bg-black/5 dark:bg-white/5"><img src={thumbnail} alt="Post preview" className="h-full w-full object-cover"/></div>:null}{item.isRead?<Check className="h-4 w-4 text-black/20 dark:text-white/20"/>:<span className="h-2.5 w-2.5 rounded-full bg-[#25d366]"/>}</div>
  </Link>
}

function notificationMessage(type:string,message:string){if(type==="like")return message||"Liked your post";if(type==="repost"||type==="reshare")return "Reshared your post";if(type==="follow")return message||"Followed you";return message}
function relativeTime(value:string|Date){const elapsed=Math.max(0,Date.now()-new Date(value).getTime()),minutes=Math.floor(elapsed/60000);if(minutes<1)return"now";if(minutes<60)return`${minutes}min`;const hours=Math.floor(minutes/60);if(hours<24)return`${hours}h`;return`${Math.floor(hours/24)}d`}
