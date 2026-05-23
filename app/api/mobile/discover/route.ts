import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getDiscoverFeed } from "@/lib/mobile-discover"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const feed = await getDiscoverFeed(session.userId)
    return NextResponse.json({ success: true, data: feed })
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to load discover feed" },
      { status: 500 },
    )
  }
}
