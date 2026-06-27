import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { deleteMessage } from "@/lib/mobile-chats"
import { logError } from "@/lib/log-error"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ otherUserId: string; messageId: string }> }
) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { otherUserId, messageId } = await params
  try {
    await deleteMessage(session.userId, otherUserId, messageId)
    return NextResponse.json({ success: true })
  } catch (error) {
    logError("DELETE /api/mobile/chats/[otherUserId]/messages/[messageId]", error)
    const msg = error instanceof Error ? error.message : "Failed to delete message"
    return NextResponse.json({ success: false, message: msg }, { status: 400 })
  }
}
