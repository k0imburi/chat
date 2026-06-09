import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getReplies, deleteComment } from "@/lib/mobile-comments"
import { logError } from "@/lib/log-error"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const { commentId } = await params
    const replies = await getReplies(commentId, session.userId)
    return NextResponse.json({ success: true, replies })
  } catch (error) {
    logError("/api/mobile/comments/[commentId] GET", error)
    return NextResponse.json({ success: false, message: "Failed to load replies" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const { commentId } = await params
    await deleteComment(commentId, session.userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    logError("/api/mobile/comments/[commentId] DELETE", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to delete comment" },
      { status: error instanceof Error && error.message.includes("authorised") ? 403 : 500 },
    )
  }
}
