import { NextResponse } from "next/server"
import { z } from "zod"
import { unlockReply } from "@/lib/mobile-chats"
import { InsufficientCreditsError } from "@/lib/mobile-credits"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { logError } from "@/lib/log-error"

const paramsSchema = z.object({
  otherUserId: z.string().min(1),
  messageId: z.string().min(1),
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
    const data = await unlockReply({
      userId: session.userId,
      messageId: params.messageId,
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      // 402 Payment Required — the app prompts the user to recharge.
      return NextResponse.json(
        { success: false, code: "INSUFFICIENT_BALANCE", message: error.message },
        { status: 402 },
      )
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      )
    }
    logError("/api/mobile/chats/[otherUserId]/messages/[messageId]/unlock", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to unlock reply" },
      { status: 500 },
    )
  }
}
