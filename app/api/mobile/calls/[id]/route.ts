import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { emitChatRealtimeToUser } from "@/lib/realtime"
import { sendCallStateFcm } from "@/lib/fcm"
import { prisma } from "@/lib/prisma"

const schema = z.object({ action: z.enum(["answer", "decline", "cancel", "missed", "end"]) })

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const [{ id }, { action }] = await Promise.all([context.params, request.json().then((body) => schema.parse(body))])
    const invite = await prisma.callInvite.findUnique({ where: { id } })
    if (!invite || (invite.callerId !== session.userId && invite.calleeId !== session.userId)) throw new Error("Call invite not found")
    if (invite.status !== "RINGING" && !(invite.status === "ANSWERED" && action === "end")) {
      return NextResponse.json({ success: true, data: invite })
    }
    if (action === "answer" && invite.calleeId !== session.userId) throw new Error("Only the recipient can answer")
    if (action === "cancel" && invite.callerId !== session.userId) throw new Error("Only the caller can cancel")
    const status = action === "answer" ? "ANSWERED" : action === "decline" ? "DECLINED" : action === "cancel" || action === "end" ? "CANCELLED" : "MISSED"
    const updated = await prisma.callInvite.update({ where: { id }, data: {
      status,
      ...(status === "ANSWERED" ? { answeredAt: new Date() } : { endedAt: new Date() }),
    } })
    // Answering is NOT an ending, and must never be broadcast as one.
    // Telling the person who just answered that the call "ended" made their
    // own client dismiss the CallKit call, which then (a) fired a CallKit
    // ENDED event that got reported back here as a decline, and (b) removed
    // the call from CallKit's accepted-call list — the very list the
    // cold-start path reads to work out which call to open. Net effect: you
    // answer, the ring disappears, and nothing opens. Only the caller needs
    // to hear about an answer (to stop their outgoing ring), and it gets its
    // own event type so no client mistakes it for a teardown.
    const answered = action === "answer"
    const userIds = answered ? [invite.callerId] : [invite.callerId, invite.calleeId]
    const installations = await prisma.deviceInstallation.findMany({
      where: { userId: { in: userIds }, isActive: true, fcmToken: { not: null } },
      select: { fcmToken: true },
    })
    const event = {
      type: answered ? "call_answered" : "call_invite_ended",
      inviteId: invite.id,
      status: action === "end" ? "ended" : status.toLowerCase(),
    }
    await sendCallStateFcm(installations.flatMap((row) => row.fcmToken ? [row.fcmToken] : []), event)
    for (const userId of userIds) {
      emitChatRealtimeToUser(userId, {
        channel: "call",
        type: answered ? "call_answered" : "call_ended",
        inviteId: invite.id,
        bookingId: invite.bookingId,
        status: action === "end" ? "ended" : status.toLowerCase(),
      })
    }
    console.info("[calls:update]", {
      inviteId: id, action, status, actorId: session.userId,
      bookingId: invite.bookingId, notified: userIds.length,
    })
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to update call" }, { status: 400 })
  }
}
