import { NextResponse } from "next/server"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { deleteComment, getReplies } from "@/lib/mobile-comments"
import { logError } from "@/lib/log-error"

/** Replies for one top-level comment — the web sheet's "View N replies". */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  try {
    const { commentId } = await params
    const viewer = await getCurrentCustomerUser()
    const replies = await getReplies(commentId, viewer?.userId ?? "")
    return NextResponse.json({ success: true, replies })
  } catch (error) {
    logError("/api/comments/[commentId] GET", error)
    return NextResponse.json({ success: false, message: "Failed to load replies" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return NextResponse.json({ success: false, message: "Sign in required" }, { status: 401 })

  try {
    const { commentId } = await params
    await deleteComment(commentId, viewer.userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    logError("/api/comments/[commentId] DELETE", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to delete comment" },
      { status: error instanceof Error && error.message.includes("authorised") ? 403 : 500 },
    )
  }
}
