import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { findMobileUserById, serializeMobileUserWithCounts } from "@/lib/mobile-users"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const user = await findMobileUserById(session.userId)
  if (!user) {
    return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    user: await serializeMobileUserWithCounts(user),
  })
}
