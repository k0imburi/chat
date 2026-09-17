import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getChats } from "@/lib/mobile-chats"
import { logError } from "@/lib/log-error"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const query = new URL(request.url).searchParams.get("q") || undefined
    const data = await getChats(session.userId, query)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    logError("/api/mobile/chats", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to load chats" },
      { status: 500 },
    )
  }
}
