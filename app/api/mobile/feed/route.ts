import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getFollowingFeed } from "@/lib/mobile-feed"
import { promotionFeed } from "@/lib/ad-delivery"
import { logError } from "@/lib/log-error"
import { renewExpiredAds } from "@/lib/ad-lifecycle"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    await renewExpiredAds()
    const feed = await getFollowingFeed(session.userId)
    try {
      const data = await promotionFeed(session.userId, feed)
      return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } })
    } catch (error) {
      logError("Ad delivery on /api/mobile/feed", error)
      return NextResponse.json({ success: true, data: feed }, { headers: { "Cache-Control": "no-store" } })
    }
  } catch (error) {
    logError("/api/mobile/feed", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to load feed" },
      { status: 500 },
    )
  }
}
