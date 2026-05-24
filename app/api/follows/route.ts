import { NextResponse } from "next/server"
import { z } from "zod"
import {
  checkFollowStatus,
  followUser,
  getFollowCounts,
  getFollowers,
  getFollowing,
  getSuggestedFollowers,
} from "@/lib/mobile-social"
import { logError } from "@/lib/log-error"

const getSchema = z.object({
  action: z.enum(["followers", "following", "suggestions", "status", "counts"]),
  userId: z.string().optional(),
  followerId: z.string().optional(),
  followedId: z.string().optional(),
})

const postSchema = z.object({
  followerId: z.string().min(1),
  followedId: z.string().min(1),
  follow: z.boolean(),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = getSchema.safeParse({
    action: url.searchParams.get("action"),
    userId: url.searchParams.get("userId") || undefined,
    followerId: url.searchParams.get("followerId") || undefined,
    followedId: url.searchParams.get("followedId") || undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
  }

  if (parsed.data.action === "status") {
    if (!parsed.data.followerId || !parsed.data.followedId) {
      return NextResponse.json({ success: false, message: "followerId and followedId are required" }, { status: 400 })
    }

    const data = await checkFollowStatus(parsed.data.followerId, parsed.data.followedId)
    return NextResponse.json({ success: true, data })
  }

  if (!parsed.data.userId) {
    return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 })
  }

  if (parsed.data.action === "followers") {
    const data = await getFollowers(parsed.data.userId)
    return NextResponse.json({ success: true, data })
  }

  if (parsed.data.action === "following") {
    const data = await getFollowing(parsed.data.userId)
    return NextResponse.json({ success: true, data })
  }

  if (parsed.data.action === "counts") {
    const data = await getFollowCounts(parsed.data.userId)
    return NextResponse.json({ success: true, data })
  }

  const data = await getSuggestedFollowers(parsed.data.userId)
  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  try {
    const parsed = postSchema.parse(await request.json())
    const data = await followUser(parsed)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    logError("/api/follows", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to update follow status" },
      { status: 500 },
    )
  }
}
