"use server"

import { UserRole } from "@prisma/client"
import { requireSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { releaseBookingReservation, settleBookedSession } from "@/lib/mobile-bookings"

async function requireFinanceAdmin() {
  const session = await requireSessionUser()
  if (!session || (session.role !== UserRole.SUPER_ADMIN && session.role !== UserRole.ADMIN)) throw new Error("Administrator access required")
  return session
}

export async function reviewCreatorKycAction(input: { userId: string; approved: boolean; reason?: string }) {
  const reviewer = await requireFinanceAdmin()
  return prisma.creatorKyc.update({ where: { userId: input.userId }, data: {
    status: input.approved ? "APPROVED" : "REJECTED", rejectionReason: input.approved ? null : input.reason || "Verification was not approved",
    reviewedAt: new Date(), reviewerId: reviewer.id,
  } })
}

export async function reviewHeldTipAction(input: { tipId: string; decision: "RELEASE" | "REFUND" }) {
  await requireFinanceAdmin()
  const tip = await prisma.tip.findUnique({ where: { id: input.tipId } })
  if (!tip || tip.reviewStatus !== "HELD") throw new Error("Held tip not found")
  return prisma.$transaction(async (tx) => {
    await tx.tip.update({ where: { id: tip.id }, data: { reviewStatus: input.decision } })
    await tx.earningLot.updateMany({ where: { source: "TIP", sourceId: tip.id, status: "HELD" }, data: input.decision === "RELEASE" ? { status: "PENDING", heldReason: null } : { status: "REVERSED", heldReason: "Refund approved by administrator" } })
    return { success: true, refundRequired: input.decision === "REFUND", transactionId: tip.transactionId }
  })
}

export async function reviewEarlyEndedBookingAction(input: { bookingId: string; releaseToCreator: boolean; decision: string }) {
  await requireFinanceAdmin()
  const booking = await prisma.callBooking.findUnique({ where: { id: input.bookingId } })
  if (!booking || booking.status !== "UNDER_REVIEW") throw new Error("Booking review not found")
  return prisma.$transaction(async (tx) => {
    if (input.releaseToCreator) await settleBookedSession(tx, booking)
    else await releaseBookingReservation(tx, booking)
    return tx.callBooking.update({ where: { id: booking.id }, data: {
      status: input.releaseToCreator ? "COMPLETED" : "REFUNDED", reviewDecision: input.decision, reviewedAt: new Date(),
    } })
  })
}
