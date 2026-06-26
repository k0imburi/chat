import Image from "next/image"
import Link from "next/link"
import { Lock } from "lucide-react"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { getCurrentCustomerUser, getCustomerChats } from "@/lib/customer-web"

export default async function ChatsPage() {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/inbox" signedIn={false}><SignInRequired title="Sign in to see chats" /></CustomerShell>
  const chats = (await getCustomerChats(user.userId)).filter((chat): chat is NonNullable<typeof chat> => Boolean(chat))

  return (
    <CustomerShell active="/inbox" signedIn>
      <div className="rounded-3xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-black/5 p-5">
          <h1 className="text-2xl font-black">Chats</h1>
          <p className="mt-1 text-sm text-neutral-500">Broadcast messages and paid creator replies appear here. Locked previews never reveal protected content.</p>
        </div>
        <div className="divide-y divide-black/5">
          {chats.map((chat) => (
            <Link key={chat.chatUserId} href={`/inbox/${chat.chatUserId}`} className="flex items-center gap-3 p-4 hover:bg-neutral-50">
              <div className="relative h-12 w-12 overflow-hidden rounded-full bg-neutral-100">
                {chat.receiver.profileAvatarUrl ? <Image src={chat.receiver.profileAvatarUrl} alt="" fill sizes="48px" className="object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-extrabold">{chat.receiver.fullname || "ChatAndTip"}</p>
                  {chat.broadcastOnly ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Broadcast</span> : null}
                </div>
                <p className="mt-1 flex items-center gap-1 truncate text-sm text-neutral-500">
                  {chat.lastMsg === "Locked reply" ? <Lock className="h-3.5 w-3.5" /> : null}
                  {chat.lastMsg || "Media message"}
                </p>
              </div>
              {chat.unread ? <span className="rounded-full bg-[#25d366] px-2 py-1 text-xs font-black text-white">{chat.unread}</span> : null}
            </Link>
          ))}
          {!chats.length ? <p className="p-8 text-center text-sm text-neutral-500">No chats yet.</p> : null}
        </div>
      </div>
    </CustomerShell>
  )
}
