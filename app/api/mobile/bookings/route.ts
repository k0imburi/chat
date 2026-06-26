import { BookingType } from "@prisma/client"
import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"
import { proposeBooking } from "@/lib/mobile-bookings"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const data = await prisma.callBooking.findMany({ where: { OR: [{ customerId: session.userId }, { creatorId: session.userId }] }, include: {
    customer: { select: { id: true, fullName: true, avatarUrl: true } }, creator: { select: { id: true, fullName: true, avatarUrl: true } },
  }, orderBy: { scheduledStart: "desc" }, take: 100 })
  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const body = await request.json()
    const type = String(body.type || "").toUpperCase() as BookingType
    if (!["VOICE", "VIDEO"].includes(type)) throw new Error("Invalid booking type")
    const data = await proposeBooking(session.userId, { creatorId: String(body.creatorId || ""), type, start: String(body.start || ""), timezone: String(body.timezone || "Africa/Nairobi") })
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Booking failed" }, { status: 400 })
  }
}
