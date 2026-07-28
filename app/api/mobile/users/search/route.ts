import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { searchMobileUsers, serializeMobileUser } from "@/lib/mobile-users"
import { logError } from "@/lib/log-error"

// GET /api/mobile/users/search?q=... — find users by username or full name.
export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  try {
    const q = new URL(request.url).searchParams.get("q")?.trim() || ""
    if (q.length < 2) {
      return NextResponse.json({ success: true, data: [] })
    }
    const users = await searchMobileUsers(q, session.userId)
    return NextResponse.json({ success: true, data: users.map((u) => serializeMobileUser(u)) })
  } catch (error) {
    logError("/api/mobile/users/search", error)
    return NextResponse.json({ success: false, message: "Search failed" }, { status: 500 })
  }
}
