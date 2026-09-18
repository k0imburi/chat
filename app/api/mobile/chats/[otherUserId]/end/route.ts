import { NextResponse } from "next/server"
import { z } from "zod"
import { endEntityChat } from "@/lib/mobile-chats"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { logError } from "@/lib/log-error"

const paramsSchema = z.object({ otherUserId: z.string().min(1) })

export async function POST(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  try {
    const { otherUserId } = paramsSchema.parse(await context.params)
    const data = await endEntityChat(session.userId, otherUserId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to end chat"
    logError("/api/mobile/chats/[otherUserId]/end", error)
    return NextResponse.json({ success: false, message }, { status: 400 })
  }
}
