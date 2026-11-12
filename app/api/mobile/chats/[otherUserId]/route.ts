import { withChatIdentity } from "@/lib/chat-identity";
import { NextResponse } from "next/server"
import { z } from "zod"
import { clearChat, markChatViewed } from "@/lib/mobile-chats"
import { ChatPrivacyError, getChatMuteState, setChatMute, setChatAnonymous } from "@/lib/mobile-chat-privacy"
import { getCustomerOrMobileSession } from "@/lib/customer-mobile-session"
import { logError } from "@/lib/log-error"

const paramsSchema = z.object({
  otherUserId: z.string().min(1),
})

async function PATCHHandler(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getCustomerOrMobileSession(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const params = paramsSchema.parse(await context.params)
    const body = z.object({ muted: z.boolean().optional(), anonymous: z.boolean().optional() }).strict().parse(await request.json().catch(() => ({})))
    if (typeof body.anonymous === "boolean") {
      const data = await setChatAnonymous(session.userId, params.otherUserId, body.anonymous)
      return NextResponse.json({ success: true, data })
    }
    if (typeof body.muted === "boolean") {
      const data = await setChatMute(session.userId, params.otherUserId, body.muted)
      return NextResponse.json({ success: true, data })
    }
    const data = await markChatViewed(session.userId, params.otherUserId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof ChatPrivacyError) return NextResponse.json({ success: false, message: error.message }, { status: error.status })
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

async function GETHandler(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getCustomerOrMobileSession(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  try {
    const params = paramsSchema.parse(await context.params)
    const data = await getChatMuteState(session.userId, params.otherUserId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    logError("GET /api/mobile/chats/[otherUserId]", error)
    return NextResponse.json({ success: false, message: "Failed to load chat settings" }, { status: 500 })
  }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getCustomerOrMobileSession(request)
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

export const PATCH = withChatIdentity(PATCHHandler, getCustomerOrMobileSession);
export const GET = withChatIdentity(GETHandler, getCustomerOrMobileSession);
export const DELETE = withChatIdentity(DELETEHandler, getCustomerOrMobileSession);
