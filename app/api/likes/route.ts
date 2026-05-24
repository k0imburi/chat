import { NextResponse } from "next/server"
import { z } from "zod"
import {
  getLikedVideoIds,
  getReceivedLikes,
  markLikeViewed,
  toggleVideoLike,
} from "@/lib/mobile-social"
import { logError } from "@/lib/log-error"

const getSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(["received", "liked_videos"]).default("received"),
})

const postSchema = z.object({
  currentUserId: z.string().min(1),
  ownerId: z.string().min(1),
  videoId: z.string().min(1),
})

const patchSchema = z.object({
  receiverId: z.string().min(1),
  senderId: z.string().min(1),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = getSchema.safeParse({
    userId: url.searchParams.get("userId") || "",
    action: url.searchParams.get("action") || "received",
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
  }

  if (parsed.data.action === "liked_videos") {
    const data = await getLikedVideoIds(parsed.data.userId)
    return NextResponse.json({ success: true, data })
  }

  const data = await getReceivedLikes(parsed.data.userId)
  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  try {
    const parsed = postSchema.parse(await request.json())
    const data = await toggleVideoLike(parsed)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    logError("/api/likes", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to toggle like" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = patchSchema.parse(await request.json())
    const data = await markLikeViewed(parsed.receiverId, parsed.senderId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    logError("/api/likes", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to update like" },
      { status: 500 },
    )
  }
}
