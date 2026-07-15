import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { reportMedia, reportUserAccount } from "@/lib/mobile-reports"
import { logError } from "@/lib/log-error"

const schema = z.object({
  message: z.string().min(1),
  reportedUserId: z.string().min(1),
  // When set, this report targets a specific post — it gets hidden from
  // everyone except its owner pending review, and the account itself isn't
  // flagged (that's a heavier, separate action).
  mediaId: z.string().optional(),
})

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsed = schema.parse(await request.json())

    if (parsed.mediaId) {
      await reportMedia({ reporterId: session.userId, mediaId: parsed.mediaId, message: parsed.message })
    } else {
      await reportUserAccount({ reporterId: session.userId, reportedUserId: parsed.reportedUserId, message: parsed.message })
    }

    return NextResponse.json({
      success: true,
      message: "Thanks for your report. We'll review this as soon as possible.",
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    const msg = error instanceof Error ? error.message : "Failed to report"
    const known = ["not found", "your own post"].some((m) => msg.includes(m))
    if (!known) logError("/api/mobile/reports", error)
    return NextResponse.json({ success: false, message: msg }, { status: known ? 400 : 500 })
  }
}
