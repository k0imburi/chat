import "server-only"

import { BookingStatus, BookingType, CreditKind, EarningSource, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createUserNotification } from "@/lib/mobile-notifications"
import { sendEmail } from "@/lib/email"
import { ON_ACCOUNT_VALUE_KES } from "@/lib/mobile-credits"

const SESSION_MINUTES = 15
const BUFFER_MINUTES = 10
// Creator-no-show ladder. Two minutes in the creator is fined a quarter of the
// session but the room stays open — they can still turn up and deliver it. By
// the third minute the session is written off: the customer is refunded and the
// creator takes a strike.
const CREATOR_FINE_MINUTES = 2
const CREATOR_FINE_PERCENT = 25
const NO_SHOW_MINUTES = 3
// Three strikes inside the 30-day window costs the creator 72 hours of calls.
const STRIKE_LIMIT = 3
const RESTRICTION_HOURS = 72
// Must match the cutoff availableSlots() uses to decide what's even offered,
// or slots that look bookable in the list would immediately fail with "can
// no longer be proposed" the moment they're picked.
const MIN_PROPOSAL_LEAD_MINUTES = 5
// COUNTER_PROPOSED keeps its original scheduledStart held (the customer still
// has a pending booking on that slot) until they accept the new time or reject.
const ACTIVE: BookingStatus[] = ["PROPOSED", "COUNTER_PROPOSED", "APPROVED", "LIVE"]

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)
const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 3_600_000)
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000)

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || ""
  return {
    year: Number(get("year")), month: Number(get("month")), day: Number(get("day")),
    hour: Number(get("hour")), minute: Number(get("minute")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
  }
}

// Convert a wall-clock time in an IANA zone to UTC without adding a timezone dependency.
function zonedDate(year: number, month: number, day: number, minuteOfDay: number, timeZone: string) {
  const wallUtc = Date.UTC(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60)
  let result = new Date(wallUtc)
  for (let i = 0; i < 3; i++) {
    const p = partsInZone(result, timeZone)
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    result = new Date(result.getTime() + wallUtc - represented)
  }
  return result
}

export async function replaceAvailability(userId: string, input: Array<{
  weekday: number; startMinute: number; endMinute: number; timezone: string;
  voiceEnabled?: boolean; videoEnabled?: boolean; maxSessionsDay?: number
}>) {
  for (const row of input) {
    if (row.weekday < 0 || row.weekday > 6 || row.startMinute < 0 || row.endMinute > 1440 || row.endMinute <= row.startMinute) {
      throw new Error("Invalid availability window")
    }
    new Intl.DateTimeFormat("en", { timeZone: row.timezone }).format()
  }
  return prisma.$transaction(async (tx) => {
    await tx.creatorAvailability.deleteMany({ where: { userId } })
    if (input.length) await tx.creatorAvailability.createMany({ data: input.map((r) => ({
      userId, ...r, voiceEnabled: r.voiceEnabled ?? true, videoEnabled: r.videoEnabled ?? true,
      maxSessionsDay: Math.max(1, Math.min(20, r.maxSessionsDay ?? 1)),
    })) })
    return tx.creatorAvailability.findMany({ where: { userId }, orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] })
  }, { timeout: 20000, maxWait: 10000 })
}

// Statuses that hold a slot: a confirmed/live call takes the slot out of
// circulation entirely, so it never shows as available and can't be re-booked.
const SLOT_HOLDING_STATUSES = ["APPROVED", "LIVE"] as const

export async function availableSlots(creatorId: string, type: BookingType, days = 14) {
  const creator = await prisma.user.findUnique({ where: { id: creatorId }, select: { callsRestrictedUntil: true } })
  if (creator?.callsRestrictedUntil && creator.callsRestrictedUntil > new Date()) return []
  const now = new Date()
  const [windows, taken] = await Promise.all([
    prisma.creatorAvailability.findMany({ where: {
      userId: creatorId, isActive: true, ...(type === "VOICE" ? { voiceEnabled: true } : { videoEnabled: true }),
    } }),
    // Already-confirmed bookings for this creator — their start times are
    // removed from the offered slots so a taken time can't be re-booked.
    prisma.callBooking.findMany({
      where: { creatorId, status: { in: [...SLOT_HOLDING_STATUSES] }, scheduledStart: { gte: now } },
      select: { scheduledStart: true },
    }),
  ])
  const takenStarts = new Set(taken.map((b) => b.scheduledStart.toISOString()))
  const slots: Array<{ start: string; end: string; timezone: string }> = []
  for (let offset = 0; offset < days; offset++) {
    const probe = addDays(now, offset)
    for (const window of windows) {
      const local = partsInZone(probe, window.timezone)
      if (local.weekday !== window.weekday) continue
      const dayStart = zonedDate(local.year, local.month, local.day, 0, window.timezone)
      for (let minute = window.startMinute; minute + SESSION_MINUTES <= window.endMinute; minute += SESSION_MINUTES + BUFFER_MINUTES) {
        const start = addMinutes(dayStart, minute)
        const end = addMinutes(start, SESSION_MINUTES)
        if (start <= addMinutes(now, MIN_PROPOSAL_LEAD_MINUTES)) continue
        if (takenStarts.has(start.toISOString())) continue // confirmed slot — not bookable
        slots.push({ start: start.toISOString(), end: end.toISOString(), timezone: window.timezone })
      }
    }
  }
  return slots.sort((a, b) => a.start.localeCompare(b.start))
}

/** True if the creator already has a confirmed (APPROVED/LIVE) call at `start`. */
async function hasConfirmedConflict(
  db: Prisma.TransactionClient | typeof prisma,
  creatorId: string,
  start: Date,
  excludeBookingId?: string,
) {
  const conflict = await db.callBooking.findFirst({
    where: {
      creatorId,
      scheduledStart: start,
      status: { in: [...SLOT_HOLDING_STATUSES] },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { id: true },
  })
  return Boolean(conflict)
}

/// Holds one session credit for a booking. The optimistic updatedAt check makes
/// two concurrent bookings unable to claim the same last credit.
async function reserveBookingCredit(tx: Prisma.TransactionClient, customerId: string, type: BookingType) {
  const field = type === "VOICE" ? "voiceSessions" : "videoSessions"
  const reserved = type === "VOICE" ? "reservedVoiceSessions" : "reservedVideoSessions"
  await tx.creditAccount.upsert({ where: { userId: customerId }, create: { userId: customerId }, update: {} })
  const account = await tx.creditAccount.findUnique({ where: { userId: customerId } })
  const available = account ? account[field] - account[reserved] : 0
  const claimed = available > 0
    ? await tx.creditAccount.updateMany({ where: { userId: customerId, updatedAt: account!.updatedAt }, data: { [reserved]: { increment: 1 } } })
    : { count: 0 }
  if (!claimed.count) throw new Error(`You need an available ${type.toLowerCase()} session credit`)
}

export async function proposeBooking(customerId: string, input: { creatorId: string; type: BookingType; start: string; timezone: string }) {
  if (customerId === input.creatorId) throw new Error("You cannot book yourself")
  const start = new Date(input.start)
  if (!Number.isFinite(start.getTime())) throw new Error("Invalid start time")
  const slots = await availableSlots(input.creatorId, input.type, 31)
  if (!slots.some((s) => s.start === start.toISOString())) throw new Error("This slot is no longer available")
  const end = addMinutes(start, SESSION_MINUTES)
  const expires = new Date(Math.min(addMinutes(new Date(), 12 * 60).getTime(), addMinutes(start, -MIN_PROPOSAL_LEAD_MINUTES).getTime()))
  if (expires <= new Date()) throw new Error("This slot can no longer be proposed")
  const reserved = input.type === "VOICE" ? "reservedVoiceSessions" : "reservedVideoSessions"
  const booking = await prisma.$transaction(async (tx) => {
    const creator = await tx.user.findUnique({
      where: { id: input.creatorId },
      select: { callsRestrictedUntil: true },
    })
    if (creator?.callsRestrictedUntil && creator.callsRestrictedUntil > new Date()) {
      throw new Error("This creator is temporarily unavailable for calls")
    }
    // No double bookings: the slot mustn't already be confirmed, and this
    // customer can't already have an active proposal/booking for it.
    if (await hasConfirmedConflict(tx, input.creatorId, start)) {
      throw new Error("This slot is already booked")
    }
    const duplicate = await tx.callBooking.findFirst({
      where: {
        customerId, creatorId: input.creatorId, scheduledStart: start,
        status: { in: ["PROPOSED", "COUNTER_PROPOSED", "APPROVED", "LIVE"] },
      },
      select: { id: true },
    })
    if (duplicate) throw new Error("You already have a booking for this time")

    await reserveBookingCredit(tx, customerId, input.type)
    try {
      return await tx.callBooking.create({ data: {
        customerId, creatorId: input.creatorId, type: input.type, timezone: input.timezone,
        scheduledStart: start, scheduledEnd: end, proposalExpiresAt: expires,
        channelId: `booking_${crypto.randomUUID().replaceAll("-", "")}`,
      }, include: { customer: true, creator: true } })
    } catch (error) {
      await tx.creditAccount.update({ where: { userId: customerId }, data: { [reserved]: { decrement: 1 } } })
      throw error
    }
  }, { timeout: 20000, maxWait: 10000 })
  await notifyBooking(booking.creatorId, booking.customerId, "New call proposal", `A ${input.type.toLowerCase()} call has been proposed. Go to my calls  section to view. `, booking.id, booking.creator.email)
  return booking
}

/// Charges the creator for turning up late. Called at the two-minute mark, and
/// again as a fallback at the write-off mark for bookings the two-minute pass
/// missed (a skipped cron tick), which is why it is guarded by
/// creatorFineAppliedAt rather than assumed to run once.
async function applyCreatorLateFine(
  tx: Prisma.TransactionClient,
  booking: { id: string; creatorId: string; type: BookingType },
  now: Date,
) {
  const kind: CreditKind = booking.type === "VOICE" ? "VOICE_SESSION" : "VIDEO_SESSION"
  const baseAmount = new Prisma.Decimal(ON_ACCOUNT_VALUE_KES[kind])
  const rate = new Prisma.Decimal(CREATOR_FINE_PERCENT)
  await tx.creatorFine.create({ data: {
    creatorId: booking.creatorId,
    bookingId: booking.id,
    baseAmount,
    ratePercent: rate,
    amount: baseAmount.mul(rate).div(100),
    reason: `Creator more than ${CREATOR_FINE_MINUTES} minutes late`,
  } })
  await tx.callBooking.update({ where: { id: booking.id }, data: { creatorFineAppliedAt: now } })
}

async function notifyBooking(userId: string, senderId: string, title: string, message: string, bookingId: string, email?: string | null) {
  await createUserNotification({ userId, senderId, title, message, type: "booking", metadata: { targetType: "booking", bookingId } })
  if (email) await sendEmail({ to: email, subject: title, text: message })
}

function reserveField(type: BookingType) { return type === "VOICE" ? "reservedVoiceSessions" : "reservedVideoSessions" }
function balanceField(type: BookingType) { return type === "VOICE" ? "voiceSessions" : "videoSessions" }

export async function releaseBookingReservation(tx: Prisma.TransactionClient, booking: { customerId: string; type: BookingType }) {
  await tx.creditAccount.update({ where: { userId: booking.customerId }, data: { [reserveField(booking.type)]: { decrement: 1 } } })
}

/**
 * Customer cancels an already-confirmed (APPROVED) booking. Unlike
 * releaseBookingReservation (used for still-pending proposals), the held
 * session credit is NOT returned to the customer and the creator earns
 * nothing either — the value is forfeited to the platform, since the creator
 * had already committed the slot and the customer backed out of it.
 */
export async function forfeitBookingReservation(tx: Prisma.TransactionClient, booking: { id: string; customerId: string; type: BookingType }) {
  const kind: CreditKind = booking.type === "VOICE" ? "VOICE_SESSION" : "VIDEO_SESSION"
  const value = new Prisma.Decimal(ON_ACCOUNT_VALUE_KES[kind])
  const idempotencyKey = `forfeit:booking:${booking.id}`
  const prior = await tx.creditLedger.findUnique({ where: { idempotencyKey } })
  if (prior) return
  await tx.creditAccount.update({ where: { userId: booking.customerId }, data: {
    [reserveField(booking.type)]: { decrement: 1 }, [balanceField(booking.type)]: { decrement: 1 },
  } })
  await tx.creditLedger.create({ data: {
    userId: booking.customerId, kind, entryType: "CONSUME", quantity: -1, value,
    idempotencyKey, metadata: { reason: "cancelled_confirmed_booking", bookingId: booking.id },
  } })
}

export async function settleBookedSession(tx: Prisma.TransactionClient, booking: { id: string; customerId: string; creatorId: string; type: BookingType }) {
  const kind: CreditKind = booking.type === "VOICE" ? "VOICE_SESSION" : "VIDEO_SESSION"
  const source: EarningSource = kind
  const value = new Prisma.Decimal(ON_ACCOUNT_VALUE_KES[kind])
  const prior = await tx.creditLedger.findUnique({ where: { idempotencyKey: `consume:booking:${booking.id}` } })
  if (prior) return
  await tx.creditAccount.update({ where: { userId: booking.customerId }, data: {
    [reserveField(booking.type)]: { decrement: 1 }, [balanceField(booking.type)]: { decrement: 1 },
  } })
  await tx.creditLedger.createMany({ data: [
    { userId: booking.customerId, kind, entryType: "CONSUME", quantity: -1, value, counterpartyId: booking.creatorId, idempotencyKey: `consume:booking:${booking.id}` },
    { userId: booking.creatorId, kind, entryType: "CREATOR_EARN", value, counterpartyId: booking.customerId, idempotencyKey: `earn:booking:${booking.id}` },
  ] })
  await tx.earningLot.create({ data: { userId: booking.creatorId, source, sourceId: booking.id, amount: value, availableAt: addDays(new Date(), 30) } })
}

export async function bookingAction(userId: string, bookingId: string, action: string, opts?: { reason?: string; start?: string }) {
  const reason = opts?.reason
  const booking = await prisma.callBooking.findUnique({ where: { id: bookingId }, include: { customer: true, creator: true } })
  if (!booking || (booking.customerId !== userId && booking.creatorId !== userId)) throw new Error("Booking not found")
  const isCreator = booking.creatorId === userId
  const restrictionActive = Boolean(
    booking.creator.callsRestrictedUntil
      && booking.creator.callsRestrictedUntil > new Date(),
  )
  if (
    restrictionActive
    && ["approve", "propose_alternative", "accept_alternative", "choose_alternative"].includes(action)
  ) {
    throw new Error("This creator is temporarily unavailable for calls")
  }
  if (action === "approve") {
    if (!isCreator || booking.status !== "PROPOSED" || booking.proposalExpiresAt <= new Date()) throw new Error("This proposal cannot be approved")
    // Confirming takes the slot: block approving a second proposal for a time
    // that's already confirmed (e.g. competing proposals for the same slot).
    const updated = await prisma.$transaction(async (tx) => {
      if (await hasConfirmedConflict(tx, booking.creatorId, booking.scheduledStart, booking.id)) {
        throw new Error("You already have a confirmed call at this time")
      }
      return tx.callBooking.update({ where: { id: booking.id }, data: { status: "APPROVED", approvedAt: new Date() } })
    }, { timeout: 20000, maxWait: 10000 })
    // Both parties get the confirmation — the creator used to get nothing, so a
    // call they had just committed to left no trace in their inbox.
    await Promise.all([
      notifyBooking(booking.customerId, booking.creatorId, "Call approved", "Your call proposal was approved.", booking.id, booking.customer.email),
      notifyBooking(booking.creatorId, booking.customerId, "Call confirmed", `Your ${booking.type.toLowerCase()} call with ${booking.customer.fullName} is confirmed.`, booking.id, booking.creator.email),
    ])
    return updated
  }
  if (action === "decline") {
    if (!isCreator || booking.status !== "PROPOSED") throw new Error("This proposal cannot be declined")
    const updated = await prisma.$transaction(async (tx) => { await releaseBookingReservation(tx, booking); return tx.callBooking.update({ where: { id: booking.id }, data: { status: "DECLINED", declinedAt: new Date() } }) }, { timeout: 20000, maxWait: 10000 })
    await notifyBooking(booking.customerId, booking.creatorId, "Call request declined", "User did not confirm availability", booking.id, booking.customer.email)
    return updated
  }
  // Creator suggests a different time instead of declining outright. The
  // customer's reserved session credit stays held until they accept or reject.
  if (action === "propose_alternative") {
    if (!isCreator || booking.status !== "PROPOSED") throw new Error("This proposal cannot be rescheduled")
    if (!opts?.start) throw new Error("A new time is required")
    const proposedStart = new Date(opts.start)
    if (!Number.isFinite(proposedStart.getTime())) throw new Error("Invalid time")
    if (proposedStart.toISOString() === booking.scheduledStart.toISOString()) throw new Error("Pick a different time")
    const slots = await availableSlots(booking.creatorId, booking.type, 31)
    if (!slots.some((s) => s.start === proposedStart.toISOString())) throw new Error("That time is not available")
    const proposedEnd = addMinutes(proposedStart, SESSION_MINUTES)
    const expires = new Date(Math.min(addMinutes(new Date(), 12 * 60).getTime(), addMinutes(proposedStart, -MIN_PROPOSAL_LEAD_MINUTES).getTime()))
    if (expires <= new Date()) throw new Error("That time is too soon to propose")
    const updated = await prisma.callBooking.update({ where: { id: booking.id }, data: {
      status: "COUNTER_PROPOSED",
      originalStart: booking.originalStart ?? booking.scheduledStart,
      originalEnd: booking.originalEnd ?? booking.scheduledEnd,
      scheduledStart: proposedStart,
      scheduledEnd: proposedEnd,
      proposedStart,
      proposedEnd,
      counterProposedAt: new Date(),
      proposalExpiresAt: expires,
    } })
    await notifyBooking(booking.customerId, booking.creatorId, "New time suggested", `${booking.creator.fullName} suggested a different time for your ${booking.type.toLowerCase()} call.`, booking.id, booking.customer.email)
    return updated
  }
  // Customer accepts the creator's suggested time: the booking moves to that
  // slot and is approved (the creator already committed to it).
  if (action === "accept_alternative") {
    if (isCreator || booking.status !== "COUNTER_PROPOSED" || !booking.proposedStart || !booking.proposedEnd) throw new Error("There is no time to accept")
    if (booking.proposalExpiresAt <= new Date()) throw new Error("This suggestion has expired")
    const proposedStart = booking.scheduledStart
    const proposedEnd = booking.scheduledEnd
    try {
      const updated = await prisma.$transaction(async (tx) => {
        // The suggested time must not already be confirmed by another booking.
        if (await hasConfirmedConflict(tx, booking.creatorId, proposedStart, booking.id)) {
          throw new Error("That time is no longer available")
        }
        return tx.callBooking.update({ where: { id: booking.id }, data: {
          status: "APPROVED", approvedAt: new Date(),
          scheduledStart: proposedStart, scheduledEnd: proposedEnd,
          proposedStart: null, proposedEnd: null,
        } })
      }, { timeout: 20000, maxWait: 10000 })
      await notifyBooking(booking.creatorId, booking.customerId, "Time confirmed", `${booking.customer.fullName} accepted your suggested time.`, booking.id, booking.creator.email)
      return updated
    } catch {
      throw new Error("That time is no longer available")
    }
  }
  // The customer can move the same reservation to another slot. It returns
  // to the creator for approval; no second booking is created and no credit
  // is released.
  // Also the way back from a DECLINED booking: the creator said no to the time,
  // not to the call, so the customer can put a different slot forward on the
  // same booking instead of starting over.
  if (action === "choose_alternative") {
    const wasDeclined = booking.status === "DECLINED"
    if (isCreator || !(booking.status === "COUNTER_PROPOSED" || wasDeclined)) throw new Error("There is no time to change")
    if (!opts?.start) throw new Error("Choose another time")
    const chosenStart = new Date(opts.start)
    if (!Number.isFinite(chosenStart.getTime())) throw new Error("Invalid time")
    const slots = await availableSlots(booking.creatorId, booking.type, 31)
    if (!slots.some((s) => s.start === chosenStart.toISOString())) throw new Error("That time is not available")
    const chosenEnd = addMinutes(chosenStart, SESSION_MINUTES)
    const expires = new Date(Math.min(addMinutes(new Date(), 12 * 60).getTime(), addMinutes(chosenStart, -MIN_PROPOSAL_LEAD_MINUTES).getTime()))
    if (expires <= new Date()) throw new Error("That time is too soon to propose")
    const updated = await prisma.$transaction(async (tx) => {
      if (await hasConfirmedConflict(tx, booking.creatorId, chosenStart, booking.id)) {
        throw new Error("That time is already booked")
      }
      // A COUNTER_PROPOSED booking still holds the customer's credit. A DECLINED
      // one released it on decline, so it has to be taken again — and the
      // customer may have spent it in the meantime.
      if (wasDeclined) await reserveBookingCredit(tx, booking.customerId, booking.type)
      return tx.callBooking.update({ where: { id: booking.id }, data: {
        status: "PROPOSED", scheduledStart: chosenStart, scheduledEnd: chosenEnd,
        proposedStart: null, proposedEnd: null, proposalExpiresAt: expires,
        declinedAt: null,
      } })
    }, { timeout: 20000, maxWait: 10000 })
    await notifyBooking(booking.creatorId, booking.customerId, "Another time selected", `${booking.customer.fullName} selected another time for your approval.`, booking.id, booking.creator.email)
    return updated
  }
  if (action === "cancel") {
    // A still-pending proposal can be cancelled by either side, simply
    // releasing the held session credit back to the customer. Once a call is
    // CONFIRMED (APPROVED), only the customer can back out of it — and doing
    // so forfeits the session credit (no refund, no creator payout) since the
    // creator already committed the slot. The creator cannot cancel a
    // confirmed booking through booking management.
    const isPending = booking.status === "PROPOSED" || booking.status === "COUNTER_PROPOSED"
    const isConfirmed = booking.status === "APPROVED"
    if (!isPending && !(isConfirmed && !isCreator)) throw new Error("A confirmed call can't be cancelled")
    return prisma.$transaction(async (tx) => {
      if (isConfirmed) {
        await forfeitBookingReservation(tx, booking)
      } else {
        await releaseBookingReservation(tx, booking)
      }
      return tx.callBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledAt: new Date(), endReason: reason } })
    }, { timeout: 20000, maxWait: 10000 }).then(async (updated) => {
      if (isConfirmed) {
        await notifyBooking(booking.creatorId, booking.customerId, "Call cancelled", `${booking.customer.fullName} cancelled the confirmed ${booking.type.toLowerCase()} call.`, booking.id, booking.creator.email)
      }
      return updated
    })
  }
  if (action === "report_policy_violation") {
    if (!["APPROVED", "LIVE"].includes(booking.status) || !reason?.trim()) throw new Error("A policy violation reason is required")
    return prisma.callBooking.update({ where: { id: booking.id }, data: {
      status: "UNDER_REVIEW", completedAt: new Date(), endReason: reason.trim(),
    } })
  }
  // Either side may hang up whenever they like. What happens to the money
  // depends on who ended it:
  //   customer, creator present  -> session delivered, creator paid in full
  //   customer, creator absent   -> nothing was delivered, credit returned
  //   creator                    -> must say why, value held under review
  if (action === "end") {
    if (!["APPROVED", "LIVE"].includes(booking.status)) throw new Error("This call is not in progress")
    if (isCreator) {
      if (!reason?.trim()) throw new Error("Tell us why you ended the call")
      const updated = await prisma.callBooking.update({ where: { id: booking.id }, data: {
        status: "UNDER_REVIEW", completedAt: new Date(), endReason: reason.trim(),
      } })
      await notifyBooking(
        booking.customerId, booking.creatorId, "Call ended early",
        "Call ended. Under review.",
        booking.id, booking.customer.email,
      )
      return updated
    }
    const delivered = Boolean(booking.creatorJoinedAt)
    const updated = await prisma.$transaction(async (tx) => {
      if (delivered) {
        await settleBookedSession(tx, booking)
      } else {
        await releaseBookingReservation(tx, booking)
      }
      return tx.callBooking.update({ where: { id: booking.id }, data: {
        status: delivered ? "COMPLETED" : "CANCELLED",
        completedAt: new Date(),
        ...(delivered ? {} : { cancelledAt: new Date() }),
        endReason: reason?.trim() || (delivered ? "Ended by the user" : "Ended by the user before the creator joined"),
      } })
    }, { timeout: 20000, maxWait: 10000 })
    await notifyBooking(
      booking.creatorId, booking.customerId,
      delivered ? "Call ended" : "Call ended before you joined",
      delivered
        ? `${booking.customer.fullName} ended the call. You've been paid in full.`
        : `${booking.customer.fullName} ended the call before you joined.`,
      booking.id, booking.creator.email,
    )
    return updated
  }
  throw new Error("Unknown booking action")
}

export async function joinBooking(userId: string, bookingId: string) {
  const booking = await prisma.callBooking.findUnique({ where: { id: bookingId }, include: { creator: { select: { callsRestrictedUntil: true } } } })
  if (!booking || (booking.customerId !== userId && booking.creatorId !== userId) || !["APPROVED", "LIVE"].includes(booking.status)) throw new Error("Booking is not available")
  if (booking.creator.callsRestrictedUntil && booking.creator.callsRestrictedUntil > new Date()) throw new Error("This creator is temporarily unavailable for calls")
  const now = new Date()
  // The room opens exactly at the scheduled start (no early entry) and stays
  // open a few minutes past the end so a late join still connects.
  if (now < booking.scheduledStart || now > addMinutes(booking.scheduledEnd, 5)) throw new Error("The call room is not open")
  return prisma.callBooking.update({ where: { id: booking.id }, data: {
    status: "LIVE", ...(userId === booking.customerId ? { customerJoinedAt: now } : { creatorJoinedAt: now }),
  } })
}

export async function reconcileBookings() {
  const now = new Date()
  // A proposal nobody confirmed in time. The held session credit goes back to
  // the customer and neither side is penalised (this is NOT a no-show), but
  // both are told why it lapsed — otherwise the credit silently reappears and
  // the booking just reads "Expired" with no explanation.
  const expired = await prisma.callBooking.findMany({
    where: { status: { in: ["PROPOSED", "COUNTER_PROPOSED"] }, proposalExpiresAt: { lte: now } },
    include: { customer: true, creator: true },
  })
  for (const b of expired) {
    await prisma.$transaction(async (tx) => {
      await releaseBookingReservation(tx, b)
      await tx.callBooking.update({ where: { id: b.id }, data: { status: "EXPIRED" } })
    }, { timeout: 20000, maxWait: 10000 })
    await Promise.all([
      notifyBooking(
        b.customerId, b.creatorId, "Call request expired",
        `Your ${b.type.toLowerCase()} call request wasn't confirmed in time, so it expired. Your session credit has been returned.`,
        b.id, b.customer.email,
      ),
      notifyBooking(
        b.creatorId, b.customerId, "Call request expired",
        `A ${b.type.toLowerCase()} call request from ${b.customer.fullName} expired before you confirmed it.`,
        b.id, b.creator.email,
      ),
    ])
  }
  const reminders = await prisma.callBooking.findMany({ where: { status: "APPROVED", reminderSentAt: null, scheduledStart: { gt: now, lte: addMinutes(now, 10) } }, include: { customer: true, creator: true } })
  for (const b of reminders) {
    // Usually ~10 minutes, but a booking approved with less than 10 minutes
    // left is caught by this same query on its first tick — the title
    // should say how long is actually left, not always "10 minutes".
    const minutesLeft = Math.max(1, Math.round((b.scheduledStart.getTime() - now.getTime()) / 60_000))
    const title = `Call starts in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}`
    await Promise.all([
      notifyBooking(b.customerId, b.creatorId, title, "Your booked call starts soon.", b.id, b.customer.email),
      notifyBooking(b.creatorId, b.customerId, title, "Your booked call starts soon.", b.id, b.creator.email),
    ])
    await prisma.callBooking.update({ where: { id: b.id }, data: { reminderSentAt: now } })
  }
  // Stage one of the no-show ladder: the creator is late, so they lose a
  // quarter of the session — but the booking stays APPROVED/LIVE so they can
  // still join and earn the rest. Bounded above by the write-off mark so a
  // booking is only ever handled by one stage per tick.
  const lateCreators = await prisma.callBooking.findMany({ where: {
    status: { in: ["APPROVED", "LIVE"] }, creatorJoinedAt: null, creatorFineAppliedAt: null,
    scheduledStart: {
      lte: addMinutes(now, -CREATOR_FINE_MINUTES),
      gt: addMinutes(now, -NO_SHOW_MINUTES),
    },
  }, include: { creator: true, customer: true } })
  for (const b of lateCreators) {
    const fined = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM CallBooking WHERE id = ${b.id} FOR UPDATE`
      const current = await tx.callBooking.findUnique({ where: { id: b.id } })
      if (
        !current
        || !["APPROVED", "LIVE"].includes(current.status)
        || current.creatorJoinedAt
        || current.creatorFineAppliedAt
      ) return false
      await applyCreatorLateFine(tx, current, now)
      return true
    }, { timeout: 20000, maxWait: 10000 })
    if (!fined) continue
    await Promise.all([
      notifyBooking(
        b.creatorId, b.customerId, "You're late",
        "Join the call now.",
        b.id, b.creator.email,
      ),
      notifyBooking(
        b.customerId, b.creatorId, "Running late",
        "The creator hasn't joined yet. Stay on the call.",
        b.id, b.customer.email,
      ),
    ])
  }
  const creatorNoShows = await prisma.callBooking.findMany({ where: {
    status: { in: ["APPROVED", "LIVE"] }, creatorJoinedAt: null,
    scheduledStart: { lte: addMinutes(now, -NO_SHOW_MINUTES) },
  }, include: { creator: true, customer: true } })
  for (const b of creatorNoShows) {
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM CallBooking WHERE id = ${b.id} FOR UPDATE`
      const current = await tx.callBooking.findUnique({ where: { id: b.id } })
      if (
        !current
        || !["APPROVED", "LIVE"].includes(current.status)
        || current.creatorJoinedAt
      ) return null
      await releaseBookingReservation(tx, current)
      await tx.callBooking.update({ where: { id: current.id }, data: { status: "CREATOR_NO_SHOW", completedAt: now } })
      // Normally the two-minute pass already fined them; only charge here if it
      // didn't get the chance.
      if (!current.creatorFineAppliedAt) await applyCreatorLateFine(tx, current, now)
      await tx.creatorStrike.create({ data: {
        creatorId: current.creatorId,
        bookingId: current.id,
        reason: `Creator did not join within ${NO_SHOW_MINUTES} minutes`,
        expiresAt: addDays(now, 30),
      } })
      const active = await tx.creatorStrike.findMany({ where: {
        creatorId: current.creatorId,
        consumedAt: null,
        createdAt: { gte: addDays(now, -30) },
      }, orderBy: { createdAt: "asc" } })
      const restrictedUntil = active.length >= STRIKE_LIMIT ? addHours(now, RESTRICTION_HOURS) : null
      const affected: Array<{ id: string; customerId: string; type: BookingType }> = []
      if (restrictedUntil) {
        const bookings = await tx.callBooking.findMany({ where: {
          creatorId: current.creatorId,
          id: { not: current.id },
          status: { in: ["PROPOSED", "COUNTER_PROPOSED", "APPROVED"] },
          scheduledStart: { gt: now, lt: restrictedUntil },
        }, select: { id: true, customerId: true, type: true } })
        for (const future of bookings) {
          await releaseBookingReservation(tx, future)
          await tx.callBooking.update({ where: { id: future.id }, data: {
            status: "CANCELLED",
            cancelledAt: now,
            endReason: "Creator call restriction",
          } })
          affected.push(future)
        }
        await tx.creatorStrike.updateMany({
          where: { id: { in: active.map((strike) => strike.id) } },
          data: { consumedAt: now },
        })
      }
      await tx.user.update({ where: { id: current.creatorId }, data: {
        activeStrikeCount: restrictedUntil ? 0 : active.length,
        ...(restrictedUntil ? { callsRestrictedUntil: restrictedUntil } : {}),
      } })
      return { strikeTotal: active.length, restrictedUntil, affected }
    }, { timeout: 20000, maxWait: 10000 })
    if (!outcome) continue
    const strikeMessage = outcome.restrictedUntil
      ? `Missed call — strike ${STRIKE_LIMIT}/${STRIKE_LIMIT}. Calls restricted for ${RESTRICTION_HOURS} hours.`
      : `Missed call — strike ${outcome.strikeTotal}/${STRIKE_LIMIT}.`
    await Promise.all([
      notifyBooking(b.creatorId, b.customerId, "Strike recorded", strikeMessage, b.id, b.creator.email),
      // The customer used to be told nothing at all here — their credit came
      // back with no explanation of why the call never happened.
      notifyBooking(
        b.customerId, b.creatorId, "Call refunded",
        `${b.creator.fullName} didn't join. You've been refunded.`,
        b.id, b.customer.email,
      ),
    ])
    for (const affected of outcome.affected) {
      await Promise.all([
        notifyBooking(affected.customerId, b.creatorId, "Call cancelled and refunded", "Cancelled and refunded.", affected.id),
        notifyBooking(b.creatorId, affected.customerId, "Call cancelled", "Cancelled — you're restricted.", affected.id, b.creator.email),
      ])
    }
  }
  // The other half of the three-minute "did both parties join?" check. The
  // creator showed up and the customer hasn't, which costs the customer the
  // session (settled at scheduledEnd) — but nobody used to say so while there
  // was still time to join. The outcome is unchanged; this is the warning.
  const lateCustomers = await prisma.callBooking.findMany({ where: {
    status: { in: ["APPROVED", "LIVE"] },
    customerJoinedAt: null, creatorJoinedAt: { not: null },
    lateNoticeSentAt: null,
    scheduledStart: { lte: addMinutes(now, -NO_SHOW_MINUTES) },
    scheduledEnd: { gt: now },
  }, include: { creator: true, customer: true } })
  for (const b of lateCustomers) {
    const claimed = await prisma.callBooking.updateMany({
      where: { id: b.id, lateNoticeSentAt: null },
      data: { lateNoticeSentAt: now },
    })
    if (!claimed.count) continue
    await Promise.all([
      notifyBooking(
        b.customerId, b.creatorId, "Your call is waiting",
        `${b.creator.fullName} is waiting. Join now.`,
        b.id, b.customer.email,
      ),
      notifyBooking(
        b.creatorId, b.customerId, "The user hasn't joined",
        "Stay on the call — it still counts.",
        b.id, b.creator.email,
      ),
    ])
  }
  const due = await prisma.callBooking.findMany({ where: { status: { in: ["APPROVED", "LIVE"] }, scheduledEnd: { lte: now } } })
  for (const b of due) await prisma.$transaction(async (tx) => {
    if (!b.creatorJoinedAt) {
      // Creator never joined — refund reservation, no creator payment
      await releaseBookingReservation(tx, b)
      await tx.callBooking.update({ where: { id: b.id }, data: { status: "CREATOR_NO_SHOW", completedAt: now } })
    } else {
      await settleBookedSession(tx, b)
      await tx.callBooking.update({ where: { id: b.id }, data: { status: b.customerJoinedAt ? "COMPLETED" : "USER_NO_SHOW", completedAt: now } })
    }
  }, { timeout: 20000, maxWait: 10000 })
  // Auto-resolve UNDER_REVIEW bookings after 24 h. Creator ended early so
  // the customer gets a full refund — no manual admin review happened.
  const staleReview = await prisma.callBooking.findMany({
    where: { status: "UNDER_REVIEW", completedAt: { lte: addDays(now, -1) } },
  })
  for (const b of staleReview) await prisma.$transaction(async (tx) => {
    await releaseBookingReservation(tx, b)
    await tx.callBooking.update({ where: { id: b.id }, data: { status: "REFUNDED", endReason: (b.endReason ? b.endReason + " — auto-refunded after 24 h" : "Auto-refunded after 24 h review window") } })
  }, { timeout: 20000, maxWait: 10000 })

  await prisma.user.updateMany({ where: { callsRestrictedUntil: { lte: now } }, data: { callsRestrictedUntil: null } })
  return { expired: expired.length, reminded: reminders.length, fines: creatorNoShows.length, creatorNoShows: creatorNoShows.length, settled: due.length, autoRefunded: staleReview.length }
}
