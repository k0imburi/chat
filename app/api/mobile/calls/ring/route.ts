import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { emitChatRealtimeToUser } from "@/lib/realtime"
import { logError } from "@/lib/log-error"

const ringSchema = z.object({
  calleeId: z.string().min(1),
  call: z.record(z.unknown()),
})

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = ringSchema.parse(await request.json())

    emitChatRealtimeToUser(body.calleeId, {
      channel: "call",
      type: "call_ring",
      call: body.call,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }
    logError("/api/mobile/calls/ring", error)
    return NextResponse.json({ success: false, message: "Failed to ring" }, { status: 500 })
  }
}
