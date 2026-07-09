import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { reportCopyright } from "@/lib/mobile-copyright"
import { logError } from "@/lib/log-error"

const bodySchema = z.object({ mediaId: z.string().min(1) })

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  try {
    const { mediaId } = bodySchema.parse(await request.json())
    const data = await reportCopyright(session.userId, mediaId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }
    const msg = error instanceof Error ? error.message : "Report failed"
    const known = ["not found", "your own post"].some((m) => msg.includes(m))
    if (!known) logError("/api/mobile/reports/copyright", error)
    return NextResponse.json({ success: false, message: msg }, { status: known ? 400 : 500 })
  }
}
