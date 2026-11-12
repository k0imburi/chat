import { NextResponse } from "next/server"
import { findMobileUserById, serializeMobileUserWithCounts } from "@/lib/mobile-users"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { resolveChatPeer, protectChatPayload } from "@/lib/chat-identity"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const { id } = await context.params
  if (id.startsWith("anon_")) {
    try {
      const peerId = await resolveChatPeer(session.userId, id)
      const user = await findMobileUserById(peerId)
      if (!user || !user.isActive) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
      const masked = await protectChatPayload(session.userId, { userId: peerId, fullname: "Anonymous" }) as Record<string, unknown>
      if (masked.isAnonymous !== true) return NextResponse.json({ success: false, message: "Please reopen the conversation from your chat list." }, { status: 404 })
      return NextResponse.json({ success: true, user: masked })
    } catch {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
    }
  }
  const user = await findMobileUserById(id)

  if (!user || !user.isActive || ["BLOCKED", "HIDDEN"].includes(user.status)) {
    return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
  }

  const serialized = await serializeMobileUserWithCounts(user)

  // Copyright-flagged and reported posts are visible only to their owner.
  if (session?.userId !== id && Array.isArray(serialized.gallery)) {
    serialized.gallery = serialized.gallery.filter((v) => {
      const item = v as { copyrightStatus?: string | null; reportStatus?: string | null; isHiddenByOwner?: boolean }
      return !item.copyrightStatus && !item.reportStatus && !item.isHiddenByOwner
    })
  }

  return NextResponse.json({ success: true, user: serialized })
}
