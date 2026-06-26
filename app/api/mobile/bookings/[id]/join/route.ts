import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { joinBooking } from "@/lib/mobile-bookings"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const { id } = await context.params
    return NextResponse.json({ success: true, data: await joinBooking(session.userId, id) })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to join" }, { status: 400 })
  }
}
