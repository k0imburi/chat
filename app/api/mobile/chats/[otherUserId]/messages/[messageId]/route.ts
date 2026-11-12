import { withChatIdentity } from "@/lib/chat-identity";
import { NextResponse } from "next/server"
import { getCustomerOrMobileSession } from "@/lib/customer-mobile-session"
import { deleteMessage } from "@/lib/mobile-chats"
import { logError } from "@/lib/log-error"
import { z } from "zod"
import { ChatPrivacyError, pinChatMessage } from "@/lib/mobile-chat-privacy"

async function DELETEHandler(
  request: Request,
  { params }: { params: Promise<{ otherUserId: string; messageId: string }> }
) {
  const session = await getCustomerOrMobileSession(request)
  if (!session) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const { otherUserId, messageId } = await params
  try {
    const scope = z.enum(["me", "both"]).parse(new URL(request.url).searchParams.get("scope") ?? "me")
    await deleteMessage(session.userId, otherUserId, messageId, scope)
    return NextResponse.json({ success: true })
  } catch (error) {
    logError("DELETE /api/mobile/chats/[otherUserId]/messages/[messageId]", error)
    const msg = error instanceof Error ? error.message : "Failed to delete message"
    return NextResponse.json({ success: false, message: msg }, { status: 400 })
  }
}

async function PATCHHandler(
  request: Request,
  { params }: { params: Promise<{ otherUserId: string; messageId: string }> },
) {
  const session = await getCustomerOrMobileSession(request)
  if (!session) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const { otherUserId, messageId } = await params
    const body = z.object({ pinned: z.boolean() }).parse(await request.json())
    const data = await pinChatMessage(session.userId, otherUserId, messageId, body.pinned)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    if (error instanceof ChatPrivacyError) return NextResponse.json({ success: false, message: error.message }, { status: error.status })
    logError("PATCH /api/mobile/chats/[otherUserId]/messages/[messageId]", error)
    return NextResponse.json({ success: false, message: "Failed to update message" }, { status: 500 })
  }
}


export const DELETE = withChatIdentity(DELETEHandler, getCustomerOrMobileSession);
export const PATCH = withChatIdentity(PATCHHandler, getCustomerOrMobileSession);
