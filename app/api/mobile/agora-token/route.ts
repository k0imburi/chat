import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { logError } from "@/lib/log-error"
import { RtcTokenBuilder, RtcRole } from "agora-access-token"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const bookingId = searchParams.get("bookingId") ?? ""
    const uid = parseInt(searchParams.get("uid") ?? "0", 10)

    if (!bookingId) {
      return NextResponse.json(
        { success: false, message: "bookingId is required" },
        { status: 400 },
      )
    }
    const booking = await prisma.callBooking.findFirst({ where: {
      id: bookingId,
      OR: [{ customerId: session.userId }, { creatorId: session.userId }],
      status: { in: ["APPROVED", "LIVE"] },
    } })
    if (!booking || Date.now() < booking.scheduledStart.getTime() - 10 * 60_000 || Date.now() > booking.scheduledEnd.getTime() + 5 * 60_000) {
      return NextResponse.json({ success: false, message: "Booking room is not available" }, { status: 403 })
    }
    const channelId = booking.channelId

    const appId = process.env.AGORA_APP_ID
    const appCertificate = process.env.AGORA_APP_CERTIFICATE

    if (!appId) {
      return NextResponse.json(
        { success: false, message: "AGORA_APP_ID is not configured" },
        { status: 500 },
      )
    }

    // If no certificate is set (e.g. Agora project in test mode), return an
    // empty token — Agora accepts this when certificate auth is disabled.
    if (!appCertificate) {
      return NextResponse.json({ success: true, data: { token: "", channelId } })
    }

    const expiresAt = Math.floor(Date.now() / 1000) + 3600 // 1 hour

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelId,
      uid,
      RtcRole.PUBLISHER,
      expiresAt,
    )

    return NextResponse.json({ success: true, data: { token, channelId } })
  } catch (error) {
    logError("/api/mobile/agora-token", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to generate token" },
      { status: 500 },
    )
  }
}
