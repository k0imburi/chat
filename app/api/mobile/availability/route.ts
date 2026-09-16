import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"
import { replaceAvailability } from "@/lib/mobile-bookings"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const userId = new URL(request.url).searchParams.get("userId") || session.userId
  const [data, user] = await Promise.all([
    prisma.creatorAvailability.findMany({ where: { userId, isActive: true }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] }),
    prisma.user.findUnique({ where: { id: userId }, select: { accountType: true, entityCallDurationMinutes: true, entityCallBufferMinutes: true } }),
  ])
  return NextResponse.json({
    success: true,
    data: data.map((row) => ({
      ...row,
      sessionMinutes: user?.accountType === "ENTITY" ? user.entityCallDurationMinutes : 15,
      bufferMinutes: user?.accountType === "ENTITY" ? user.entityCallBufferMinutes : 10,
    })),
  })
}

export async function PUT(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const body = await request.json()
    const account = await prisma.user.findUnique({ where: { id: session.userId }, select: { accountType: true } })
    if (account?.accountType === "ENTITY") {
      const duration = Number(body.sessionMinutes ?? 15)
      if (![5, 10, 15].includes(duration)) throw new Error("Entity calls must be 5, 10 or 15 minutes")
      await prisma.user.update({
        where: { id: session.userId },
        data: { entityCallDurationMinutes: duration, entityCallBufferMinutes: 5 },
      })
    }
    const data = await replaceAvailability(session.userId, Array.isArray(body.windows) ? body.windows : [])
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Invalid availability" }, { status: 400 })
  }
}
