import { NextResponse } from "next/server"
import { z } from "zod"
import { clearChat, markChatViewed } from "@/lib/mobile-chats"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { logError } from "@/lib/log-error"

const paramsSchema = z.object({
  otherUserId: z.string().min(1),
})

export async function PATCH(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const params = paramsSchema.parse(await context.params)
    const data = await markChatViewed(session.userId, params.otherUserId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }

    logError("/api/mobile/chats/[otherUserId]", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to update chat" },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const params = paramsSchema.parse(await context.params)
    const data = await clearChat(session.userId, params.otherUserId)
    return NextResponse.json({ success: true, data, message: "Chat deleted successfully" })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }

    logError("/api/mobile/chats/[otherUserId]", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to delete chat" },
      { status: 500 },
    )
  }
}
