import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"
import { replaceAvailability } from "@/lib/mobile-bookings"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const userId = new URL(request.url).searchParams.get("userId") || session.userId
  const data = await prisma.creatorAvailability.findMany({ where: { userId, isActive: true }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] })
  return NextResponse.json({ success: true, data })
}

export async function PUT(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const body = await request.json()
    const data = await replaceAvailability(session.userId, Array.isArray(body.windows) ? body.windows : [])
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Invalid availability" }, { status: 400 })
  }
}
