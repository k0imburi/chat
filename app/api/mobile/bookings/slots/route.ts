import { BookingType } from "@prisma/client"
import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { availableSlots } from "@/lib/mobile-bookings"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const params = new URL(request.url).searchParams
  const creatorId = params.get("creatorId") || ""
  const type = params.get("type")?.toUpperCase() as BookingType
  if (!creatorId || !["VOICE", "VIDEO"].includes(type)) return NextResponse.json({ success: false, message: "creatorId and type are required" }, { status: 400 })
  return NextResponse.json({ success: true, data: await availableSlots(creatorId, type) })
}
