import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { ChatInbox } from "@/components/customer/chat-inbox"
import { getCurrentCustomerUser, getCustomerChats } from "@/lib/customer-web"

export default async function ChatsPage() {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/inbox" signedIn={false}><SignInRequired title="Sign in to see chats" /></CustomerShell>
  const chats = (await getCustomerChats(user.userId)).filter((chat): chat is NonNullable<typeof chat> => Boolean(chat))

  return <CustomerShell active="/inbox" signedIn><ChatInbox viewerId={user.userId} initialChats={chats} /></CustomerShell>
}
