import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getComments, createComment } from "@/lib/mobile-comments"
import { logError } from "@/lib/log-error"

const getSchema = z.object({
  videoId: z.string().min(1),
  cursor: z.string().optional(),
})

const postSchema = z.object({
  videoId: z.string().min(1),
  text: z.string().min(1).max(1000),
  parentId: z.string().optional(),
})

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const parsed = getSchema.safeParse({
    videoId: url.searchParams.get("videoId") || "",
    cursor: url.searchParams.get("cursor") || undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "videoId is required" }, { status: 400 })
  }

  try {
    const data = await getComments(parsed.data.videoId, session.userId, parsed.data.cursor)
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    logError("/api/mobile/comments GET", error)
    return NextResponse.json({ success: false, message: "Failed to load comments" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsed = postSchema.parse(await request.json())
    const comment = await createComment(parsed.videoId, session.userId, parsed.text, parsed.parentId)
    return NextResponse.json({ success: true, comment })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }
    logError("/api/mobile/comments POST", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to post comment" },
      { status: 500 },
    )
  }
}
