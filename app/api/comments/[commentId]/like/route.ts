import { NextResponse } from "next/server"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { toggleCommentLike } from "@/lib/mobile-comments"
import { logError } from "@/lib/log-error"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return NextResponse.json({ success: false, message: "Sign in required" }, { status: 401 })

  try {
    const { commentId } = await params
    const data = await toggleCommentLike(commentId, viewer.userId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    logError("/api/comments/[commentId]/like POST", error)
    return NextResponse.json({ success: false, message: "Failed to toggle like" }, { status: 500 })
  }
}
