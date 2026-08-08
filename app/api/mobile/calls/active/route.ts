import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { logError } from "@/lib/log-error"
import { prisma } from "@/lib/prisma"

// Always reflects live state — never cache.
export const dynamic = "force-dynamic"

/**
 * "Am I supposed to be in a call right now?"
 *
 * Answering a call on a killed app produces NO Dart event: the CallKit plugin
 * drops it when there's no Flutter engine and no background executor (see
 * FlutterCallkitIncomingPlugin.send). So the client cannot reliably know, on
 * its own, that the user just answered — it was left reading CallKit's private
 * SharedPreferences and racing its own launch.
 *
 * The server already knows. This makes it authoritative: on startup (and on
 * resume) the app asks what it should be doing and gets a definitive answer,
 * with no dependency on plugin internals, isolate lifetimes, or broadcast
 * timing.
 *
 * Returns the call only while it's genuinely resumable — the invite was
 * answered, and the booking is still open. A completed/cancelled booking or a
 * lapsed window returns null, so a later launch can't drag the user back into
 * a finished call.
 */
export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const now = new Date()
    const invite = await prisma.callInvite.findFirst({
      where: {
        status: "ANSWERED",
        OR: [{ callerId: session.userId }, { calleeId: session.userId }],
        booking: {
          status: { in: ["APPROVED", "LIVE"] },
          scheduledStart: { lte: now },
        },
      },
      orderBy: { answeredAt: "desc" },
      include: {
        booking: {
          include: {
            customer: { select: { id: true, fullName: true, avatarUrl: true } },
            creator: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        },
      },
    })

    // The room stays open a few minutes past the slot so a late rejoin still
    // connects — same tail joinBooking allows.
    const stillOpen = invite && now <= new Date(invite.booking.scheduledEnd.getTime() + 5 * 60_000)
    if (!invite || !stillOpen) {
      return NextResponse.json({ success: true, data: { call: null } })
    }

    const { booking } = invite
    const caller = booking.customerId === invite.callerId ? booking.customer : booking.creator
    const callee = booking.customerId === invite.calleeId ? booking.customer : booking.creator

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
      creatorId: booking.creatorId,
      expiresAt: invite.expiresAt.toISOString(),
      scheduledStart: booking.scheduledStart.toISOString(),
      scheduledEnd: booking.scheduledEnd.toISOString(),
    }

    console.info("[calls:active]", {
      userId: session.userId, inviteId: invite.id, bookingId: booking.id,
      isVideo: call.isVideo, answeredAt: invite.answeredAt?.toISOString(),
    })
    return NextResponse.json({ success: true, data: { call } })
  } catch (error) {
    logError("/api/mobile/calls/active", error)
    return NextResponse.json({ success: false, message: "Unable to load active call" }, { status: 500 })
  }
}
