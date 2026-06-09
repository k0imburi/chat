import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { toggleCommentLike } from "@/lib/mobile-comments"
import { logError } from "@/lib/log-error"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const { commentId } = await params
    const data = await toggleCommentLike(commentId, session.userId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    logError("/api/mobile/comments/[commentId]/like POST", error)
    return NextResponse.json({ success: false, message: "Failed to toggle like" }, { status: 500 })
  }
}
