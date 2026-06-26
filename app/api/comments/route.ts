import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { createComment } from "@/lib/mobile-comments"
import { logError } from "@/lib/log-error"

const schema = z.object({
  mediaId: z.string().min(1),
  text: z.string().min(1).max(1000),
})

export async function POST(request: Request) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return NextResponse.json({ success: false, message: "Sign in required" }, { status: 401 })

  try {
    const body = schema.parse(await request.json())
    const comment = await createComment(body.mediaId, viewer.userId, body.text)
    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        text: comment.text,
        createdAt: new Date(comment.createdAt).toISOString(),
        author: {
          name: viewer.fullname || "User",
          avatarUrl: viewer.profileAvatarUrl || null,
        },
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }
    logError("/api/comments", error)
    return NextResponse.json({ success: false, message: "Failed to post comment" }, { status: 500 })
  }
}
