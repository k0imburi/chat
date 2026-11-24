import { NextResponse } from "next/server"
import { promotionFeed } from '@/lib/ad-delivery'
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getDiscoverFeed, getTrendingFeed } from "@/lib/mobile-discover"
import { logError } from "@/lib/log-error"
import { FEED_LIMIT } from "@/lib/discover-score"
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

// Request the next ranked batch without repeating posts already in the feed.
export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const body = await request.json()
    if (!Array.isArray(body.excludeIds) || body.excludeIds.length > 10000 ||
        !body.excludeIds.every((id: unknown) => typeof id === "string" && id.length <= 100)) {
      return NextResponse.json({ success: false, message: "Invalid feed request" }, { status: 400 })
    }
    const excluded = new Set<string>(body.excludeIds)
    const feed = body.mode === "trending" ? await getTrendingFeed(session.userId, excluded) : await getDiscoverFeed(session.userId, excluded)
    try {
      return NextResponse.json({ success: true, data: await promotionFeed(session.userId, feed), hasMore: feed.length === FEED_LIMIT }, { headers: { "Cache-Control": "no-store" } })
    } catch (error) {
      logError("Ad delivery on /api/mobile/discover POST", error)
      return NextResponse.json({ success: true, data: feed, hasMore: feed.length === FEED_LIMIT }, { headers: { "Cache-Control": "no-store" } })
    }
  } catch (error) {
    logError("/api/mobile/discover POST", error)
    return NextResponse.json({ success: false, message: "Failed to load more posts" }, { status: 500 })
  }
}
