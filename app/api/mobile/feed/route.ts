import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getFollowingFeed } from "@/lib/mobile-feed"
import { logError } from "@/lib/log-error"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const feed = await getFollowingFeed(session.userId)
    return NextResponse.json({ success: true, data: feed })
  } catch (error) {
    logError("/api/mobile/feed", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to load feed" },
      { status: 500 },
    )
  }
}
