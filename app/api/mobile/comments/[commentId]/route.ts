import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getReplies, deleteComment, editComment, setCommentPinned } from "@/lib/mobile-comments"
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

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), text: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("pin"), pinned: z.boolean() }),
])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ commentId: string }> },
) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const { commentId } = await params
    const parsed = patchSchema.parse(await request.json())
    if (parsed.action === "edit") {
      const comment = await editComment(commentId, session.userId, parsed.text)
      return NextResponse.json({ success: true, comment })
    }
    const result = await setCommentPinned(commentId, session.userId, parsed.pinned)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : "Failed to update comment"
    return NextResponse.json(
      { success: false, message },
      { status: message.includes("authorised") ? 403 : message.includes("not found") ? 404 : 500 },
    )
  }
}
