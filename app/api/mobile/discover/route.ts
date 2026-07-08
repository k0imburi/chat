import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getDiscoverFeed, getTrendingFeed } from "@/lib/mobile-discover"
import { logError } from "@/lib/log-error"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const url = new URL(request.url)
    const mode = url.searchParams.get("mode") ?? "discover"
    const feed = mode === "trending"
      ? await getTrendingFeed(session.userId)
      : await getDiscoverFeed(session.userId)
    return NextResponse.json({ success: true, data: feed })
  } catch (error) {
    logError("/api/mobile/discover", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to load discover feed" },
      { status: 500 },
    )
  }
}
