import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { createComment, getComments } from "@/lib/mobile-comments"
import { logError } from "@/lib/log-error"

const getSchema = z.object({
  mediaId: z.string().min(1),
  cursor: z.string().optional(),
})

const postSchema = z.object({
  mediaId: z.string().min(1),
  text: z.string().min(1).max(1000),
  parentId: z.string().optional(),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = getSchema.safeParse({
    mediaId: url.searchParams.get("mediaId") || "",
    cursor: url.searchParams.get("cursor") || undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "mediaId is required" }, { status: 400 })
  }

  try {
    const viewer = await getCurrentCustomerUser()
    // getComments/getReplies/createComment already carry replyCount, likes,
    // isLiked and parentId — the web route used to project those away down to
    // {id, text, createdAt, author}, which is the entire reason the web sheet
    // had no replies or likes while the exact same backend already supported
    // both for the app. Passing the full shape through is the actual fix;
    // everything below just gives the frontend somewhere to render it.
    const data = await getComments(parsed.data.mediaId, viewer?.userId ?? "", parsed.data.cursor)
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    logError("/api/comments GET", error)
    return NextResponse.json({ success: false, message: "Failed to load comments" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return NextResponse.json({ success: false, message: "Sign in required" }, { status: 401 })

  try {
    const body = postSchema.parse(await request.json())
    const comment = await createComment(body.mediaId, viewer.userId, body.text, body.parentId)
    return NextResponse.json({ success: true, comment })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      )
    }
    logError("/api/comments POST", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to post comment" },
      { status: 500 },
    )
  }
}
