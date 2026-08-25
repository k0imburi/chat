import { notFound } from "next/navigation"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { ChatThread } from "@/components/customer/chat-thread"
import { getCurrentCustomerUser, getCustomerProfile } from "@/lib/customer-web"
import { getMessages } from "@/lib/mobile-chats"

export default async function InboxThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) {
    return (
      <CustomerShell active="/inbox" signedIn={false}>
        <SignInRequired title="Sign in to open chats" />
      </CustomerShell>
    )
  }

  const { id } = await params
  const other = await getCustomerProfile(id)
  if (!other) return notFound()

  // Initial paint only — everything after this loads live in ChatThread via
  // the same lib/mobile-chats.ts functions the mobile API routes call, over
  // fetch instead of a page reload, plus a websocket subscription on the
  // existing /ws/mobile hub so the thread updates without either side
  // reloading. The old version of this page was entirely server actions and
  // full-page revalidatePath, which is why send felt like a form submit and
  // nothing arrived from the other side until you reloaded.
  let initialMessages: Awaited<ReturnType<typeof getMessages>>["messages"] = []
  let initialState = {
    willChargeReply: false,
    turnTakingRequired: false,
    cycleState: "awaiting_icebreaker",
    viewerIsInitiator: true,
    unlockExpiresAt: null as string | null,
  }
  try {
    const result = await getMessages(viewer.userId, id)
    initialMessages = result.messages
    initialState = {
      willChargeReply: result.willChargeReply,
      turnTakingRequired: result.turnTakingRequired,
      cycleState: result.cycleState,
      viewerIsInitiator: result.viewerIsInitiator,
      unlockExpiresAt: result.unlockExpiresAt,
    }
  } catch {
    // ChatThread renders the empty state; its own client-side load retries.
  }

  const broadcastOnly = initialMessages.some((m) => m.type === "system") && other.username === "chatandtip"

  return (
    <CustomerShell active="/inbox" signedIn>
      <ChatThread
        viewerId={viewer.userId}
        otherUserId={id}
        otherName={other.fullname || "ChatAndTip"}
        otherAvatarUrl={other.profileAvatarUrl || null}
        initialMessages={initialMessages}
        initialState={initialState}
        broadcastOnly={broadcastOnly}
      />
    </CustomerShell>
  )
}
