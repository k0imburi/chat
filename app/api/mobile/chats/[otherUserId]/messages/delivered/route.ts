import { withChatIdentity } from "@/lib/chat-identity";
import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { markMessagesDelivered } from "@/lib/mobile-chats"
import { logError } from "@/lib/log-error"

const paramsSchema = z.object({ otherUserId: z.string().min(1) })
const bodySchema = z.object({
  messageIds: z.array(z.string().min(1)).max(100),
})

async function POSTHandler(
  request: Request,
  context: { params: Promise<{ otherUserId: string }> },
) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const { otherUserId } = paramsSchema.parse(await context.params)
    const body = bodySchema.parse(await request.json())
    const data = await markMessagesDelivered(session.userId, otherUserId, body.messageIds)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }
    logError("/api/mobile/chats/[otherUserId]/messages/delivered", error)
    return NextResponse.json({ success: false, message: "Failed to acknowledge delivery" }, { status: 500 })
  }
}


export const POST = withChatIdentity(POSTHandler);
