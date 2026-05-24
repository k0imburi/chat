import { NextResponse } from "next/server"
import { z } from "zod"
import { reactToMessage } from "@/lib/mobile-chats"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { logError } from "@/lib/log-error"

const paramsSchema = z.object({
  otherUserId: z.string().min(1),
  messageId: z.string().min(1),
})

const bodySchema = z.object({
  emoji: z.string().min(1).max(16),
})

export async function POST(
  request: Request,
  context: { params: Promise<unknown> },
) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const params = paramsSchema.parse(await context.params)
    const body = bodySchema.parse(await request.json())

    const data = await reactToMessage({
      userId: session.userId,
      otherUserId: params.otherUserId,
      messageId: params.messageId,
      emoji: body.emoji,
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logError("/api/mobile/chats/[otherUserId]/messages/[messageId]/react", error)
      return NextResponse.json(
        { success: false, message: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      )
    }

    logError("/api/mobile/chats/[otherUserId]/messages/[messageId]/react", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to react to message" },
      { status: 500 },
    )
  }
}
