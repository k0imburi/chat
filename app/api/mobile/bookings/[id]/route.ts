import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { bookingAction } from "@/lib/mobile-bookings"

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const [{ id }, body] = await Promise.all([context.params, request.json()])
    const data = await bookingAction(session.userId, id, String(body.action || ""), body.reason ? String(body.reason) : undefined)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Booking update failed" }, { status: 400 })
  }
}
