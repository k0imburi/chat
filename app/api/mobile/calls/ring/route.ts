import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { emitChatRealtimeToUser } from "@/lib/realtime"
import { sendCallStateFcm, sendIncomingCallFcm } from "@/lib/fcm"
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

    // Locks the booking row for the duration of the check-then-create below,
    // so two ring() calls landing at nearly the same instant are serialized
    // rather than racing. Without this, both requests could run their
    // "does an invite already exist" check before either had created one,
    // and both would create their own — the actual bug this whole block
    // exists to close, not just make less likely.
    const { invite, call, glareResolved } = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM CallBooking WHERE id = ${bookingId} FOR UPDATE`

      // Glare: the OTHER party may have already rung THIS user. Ringing them
      // back — rather than picking up the call already coming in — is how
      // one booking turned into two separate invites, two separate rings,
      // and neither side ever marked answered. This is not only a
      // near-simultaneous-tap race: it fires just as reliably whenever the
      // callee reaches the booking through the ordinary "join" button
      // instead of answering the CallKit ring, which in practice is the more
      // common way into this bug. Checked BEFORE any outbound invite of my
      // own, since if one already exists in my favor, ringing is wrong no
      // matter how it was reached.
      const incoming = await tx.callInvite.findFirst({
        where: { bookingId, callerId: callee.id, calleeId: caller.id, status: "RINGING", expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      })
      if (incoming) {
        const answered = await tx.callInvite.update({
          where: { id: incoming.id },
          data: { status: "ANSWERED", answeredAt: now },
        })
        // Roles come from the EXISTING invite, not from who is making this
        // request — the original ringer keeps caller status, and this user
        // becomes the answerer, exactly as if they had tapped Answer on the
        // CallKit ring instead of the in-app call button.
        return { invite: answered, glareResolved: true, call: {
          inviteId: answered.id,
          bookingId: booking.id,
          channelId: booking.channelId,
          isVideo: booking.type === "VIDEO",
          callerId: callee.id,
          callerName: callee.fullName,
          callerPhotoUrl: callee.avatarUrl ?? "",
          calleeId: caller.id,
          receiverName: caller.fullName,
          receiverPhotoUrl: caller.avatarUrl ?? "",
          creatorId: booking.creatorId,
          expiresAt: answered.expiresAt.toISOString(),
          scheduledStart: booking.scheduledStart.toISOString(),
          scheduledEnd: booking.scheduledEnd.toISOString(),
        } }
      }

      let outbound = await tx.callInvite.findFirst({
        where: { bookingId, callerId: caller.id, status: "RINGING", expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      })
      if (!outbound) {
        outbound = await tx.callInvite.create({ data: {
          bookingId,
          callerId: caller.id,
          calleeId: callee.id,
          expiresAt: new Date(now.getTime() + 45_000),
        } })
      }
      return { invite: outbound, glareResolved: false, call: {
        inviteId: outbound.id,
        bookingId: booking.id,
        channelId: booking.channelId,
        isVideo: booking.type === "VIDEO",
        callerId: caller.id,
        callerName: caller.fullName,
        callerPhotoUrl: caller.avatarUrl ?? "",
        calleeId: callee.id,
        receiverName: callee.fullName,
        receiverPhotoUrl: callee.avatarUrl ?? "",
        // Which side is the creator — the client needs this because ending a
        // call asks the creator for a reason but lets the customer just hang up.
        creatorId: booking.creatorId,
        expiresAt: outbound.expiresAt.toISOString(),
        // The booked slot's hard end — the client ends the call here so a
        // 15-minute session can't run indefinitely.
        scheduledStart: booking.scheduledStart.toISOString(),
        scheduledEnd: booking.scheduledEnd.toISOString(),
      } }
    }, { timeout: 20000, maxWait: 10000 })

    if (glareResolved) {
      // Tell the original caller's device(s) their outgoing ring was
      // answered — the same event the PATCH .../[id] answer action sends —
      // so their client stops ringing and moves straight into the connected
      // call instead of continuing to treat the invite as still pending.
      const installations = await prisma.deviceInstallation.findMany({
        where: { userId: callee.id, isActive: true, fcmToken: { not: null } },
        select: { fcmToken: true },
      })
      await sendCallStateFcm(installations.flatMap((row) => row.fcmToken ? [row.fcmToken] : []), {
        type: "call_answered", inviteId: invite.id, status: "answered",
      })
      emitChatRealtimeToUser(callee.id, {
        channel: "call", type: "call_answered", inviteId: invite.id, bookingId: booking.id, status: "answered",
      })
      console.info("[calls:ring] glare resolved -> answered the existing invite instead of ringing back", {
        inviteId: invite.id, bookingId, originalCallerId: callee.id, answererId: caller.id,
      })
      return NextResponse.json({ success: true, data: { invite, call } })
    }

    const installations = await prisma.deviceInstallation.findMany({
      where: { userId: callee.id, isActive: true },
      select: { platform: true, fcmToken: true, voipToken: true },
    })
    const fcmTokens = installations.flatMap((row) => row.platform === "android" && row.fcmToken ? [row.fcmToken] : [])
    if (!installations.length && callee.deviceToken) fcmTokens.push(callee.deviceToken)
    const data = Object.fromEntries(Object.entries(call).map(([key, value]) => [key, String(value)]))
    const [fcmSent] = await Promise.all([
      sendIncomingCallFcm(fcmTokens, { type: "incoming_call", ...data }),
      sendVoipPush(installations.flatMap((row) => row.voipToken ? [row.voipToken] : []), { type: "incoming_call", ...call }),
    ])
    emitChatRealtimeToUser(callee.id, { channel: "call", type: "call_ring", call })
    // A ring that reaches nobody is indistinguishable from a ring that was
    // ignored, so record what actually went out.
    console.info("[calls:ring]", {
      inviteId: invite.id, bookingId, callerId: caller.id, calleeId: callee.id,
      isVideo: booking.type === "VIDEO", fcmTokens: fcmTokens.length, fcmSent,
      installations: installations.length,
    })
    return NextResponse.json({ success: true, data: { invite, call } })
  } catch (error) {
    if (!(error instanceof z.ZodError)) logError("/api/mobile/calls/ring", error)
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to ring" }, { status: 400 })
  }
}
