import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { emitChatRealtimeToUser } from "@/lib/realtime"
import { sendIncomingCallFcm } from "@/lib/fcm"
import { sendVoipPush } from "@/lib/voip-push"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"

const schema = z.object({ bookingId: z.string().min(1) })

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const { bookingId } = schema.parse(await request.json())
    const booking = await prisma.callBooking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { id: true, fullName: true, avatarUrl: true, deviceToken: true } },
        creator: { select: { id: true, fullName: true, avatarUrl: true, deviceToken: true, callsRestrictedUntil: true } },
      },
    })
    if (!booking || !["APPROVED", "LIVE"].includes(booking.status)) throw new Error("Booking is not available")
    if (booking.customerId !== session.userId && booking.creatorId !== session.userId) throw new Error("Booking is not available")
    if (booking.creator.callsRestrictedUntil && booking.creator.callsRestrictedUntil > new Date()) throw new Error("This creator is temporarily unavailable for calls")
    const now = new Date()
    // Room opens at the scheduled start — no early entry (see joinBooking).
    if (now < booking.scheduledStart || now > new Date(booking.scheduledEnd.getTime() + 5 * 60_000)) {
      throw new Error("The call room is not open")
    }

    const caller = booking.customerId === session.userId ? booking.customer : booking.creator
    const callee = booking.customerId === session.userId ? booking.creator : booking.customer
    let invite = await prisma.callInvite.findFirst({
      where: { bookingId, callerId: caller.id, status: "RINGING", expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    })
    if (!invite) {
      invite = await prisma.callInvite.create({ data: {
        bookingId,
        callerId: caller.id,
        calleeId: callee.id,
        expiresAt: new Date(now.getTime() + 45_000),
      } })
    }

    const call = {
      inviteId: invite.id,
      bookingId: booking.id,
      channelId: booking.channelId,
      isVideo: booking.type === "VIDEO",
      callerId: caller.id,
      callerName: caller.fullName,
      callerPhotoUrl: caller.avatarUrl ?? "",
      calleeId: callee.id,
      receiverName: callee.fullName,
      receiverPhotoUrl: callee.avatarUrl ?? "",
      // Which side is the creator — the client needs this because ending a call
      // asks the creator for a reason but lets the customer just hang up.
      creatorId: booking.creatorId,
      expiresAt: invite.expiresAt.toISOString(),
      // The booked slot's hard end — the client ends the call here so a
      // 15-minute session can't run indefinitely.
      scheduledStart: booking.scheduledStart.toISOString(),
      scheduledEnd: booking.scheduledEnd.toISOString(),
    }
    const installations = await prisma.deviceInstallation.findMany({
      where: { userId: callee.id, isActive: true },
      select: { platform: true, fcmToken: true, voipToken: true },
    })
    const fcmTokens = installations.flatMap((row) => row.platform === "android" && row.fcmToken ? [row.fcmToken] : [])
    if (!installations.length && callee.deviceToken) fcmTokens.push(callee.deviceToken)
    const data = Object.fromEntries(Object.entries(call).map(([key, value]) => [key, String(value)]))
    await Promise.all([
      sendIncomingCallFcm(fcmTokens, { type: "incoming_call", ...data }),
      sendVoipPush(installations.flatMap((row) => row.voipToken ? [row.voipToken] : []), { type: "incoming_call", ...call }),
    ])
    emitChatRealtimeToUser(callee.id, { channel: "call", type: "call_ring", call })
    return NextResponse.json({ success: true, data: { invite, call } })
  } catch (error) {
    if (!(error instanceof z.ZodError)) logError("/api/mobile/calls/ring", error)
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to ring" }, { status: 400 })
  }
}
