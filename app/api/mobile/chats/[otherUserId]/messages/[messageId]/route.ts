import { NextResponse } from "next/server"
import { z } from "zod"
import { deleteMessage } from "@/lib/mobile-chats"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { logError } from "@/lib/log-error"

const paramsSchema = z.object({
  otherUserId: z.string().min(1),
  messageId: z.string().min(1),
})

export async function DELETE(request: Request, context: { params: Promise<{ otherUserId: string; messageId: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const params = paramsSchema.parse(await context.params)
    await deleteMessage(session.userId, params.otherUserId, params.messageId)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : "Failed to delete message"
    const status = msg.includes("only delete your own") ? 403 : msg.includes("not found") ? 404 : 500
    if (status === 500) logError("/api/mobile/chats/[otherUserId]/messages/[messageId] DELETE", error)
    return NextResponse.json({ success: false, message: msg }, { status })
  }
}
