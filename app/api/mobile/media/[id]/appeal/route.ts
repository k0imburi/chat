import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { appealCopyright } from "@/lib/mobile-copyright"
import { logError } from "@/lib/log-error"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  try {
    const { id } = await context.params
    const data = await appealCopyright(session.userId, id)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Appeal failed"
    const known = ["not found", "Only the owner", "not awaiting"].some((m) => msg.includes(m))
    if (!known) logError("/api/mobile/media/[id]/appeal", error)
    return NextResponse.json({ success: false, message: msg }, { status: known ? 400 : 500 })
  }
}
