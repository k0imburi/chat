import { NextResponse } from "next/server"
import { promotionFeed } from '@/lib/ad-delivery'
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getDiscoverFeed, getTrendingFeed } from "@/lib/mobile-discover"
import { logError } from "@/lib/log-error"
import { renewExpiredAds } from "@/lib/ad-lifecycle"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    await renewExpiredAds()
    const url = new URL(request.url)
    const mode = url.searchParams.get("mode") ?? "discover"
    const feed = mode === "trending"
      ? await getTrendingFeed(session.userId)
      : await getDiscoverFeed(session.userId)
    try {
      const data = await promotionFeed(session.userId, feed)
      return NextResponse.json({ success: true, data }, {headers:{'Cache-Control':'no-store'}})
    } catch (error) {
      // An ad delivery/schema issue must not make organic posts unavailable.
      logError("Ad delivery on /api/mobile/discover", error)
      return NextResponse.json({ success: true, data: feed }, {headers:{'Cache-Control':'no-store'}})
    }
  } catch (error) {
    logError("/api/mobile/discover", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to load discover feed" },
      { status: 500 },
    )
  }
}
