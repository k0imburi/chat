import { NextResponse } from "next/server"
import { z } from "zod"
import { markNotificationRead } from "@/lib/mobile-notifications"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { logError } from "@/lib/log-error"

const paramsSchema = z.object({
  notificationId: z.string().min(1),
})

export async function PATCH(request: Request, context: { params: Promise<{ notificationId: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const params = paramsSchema.parse(await context.params)
    const result = await markNotificationRead(session.userId, params.notificationId)
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }

    logError("/api/mobile/notifications/[notificationId]", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to update notification" },
      { status: 500 },
    )
  }
}
