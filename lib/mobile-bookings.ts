import "server-only"

import { BookingStatus, BookingType, CreditKind, EarningSource, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createUserNotification } from "@/lib/mobile-notifications"
import { sendEmail } from "@/lib/email"
import { ON_ACCOUNT_VALUE_KES } from "@/lib/mobile-credits"

const SESSION_MINUTES = 15
const BUFFER_MINUTES = 10
const ACTIVE: BookingStatus[] = ["PROPOSED", "APPROVED", "LIVE"]

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)
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
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { earningSuspendedUntil: true } })
  if (owner?.earningSuspendedUntil && owner.earningSuspendedUntil > new Date() && input.length) throw new Error("Availability is disabled during an earning suspension")
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

export async function availableSlots(creatorId: string, type: BookingType, days = 14) {
  const creator = await prisma.user.findUnique({ where: { id: creatorId }, select: { earningSuspendedUntil: true } })
  if (creator?.earningSuspendedUntil && creator.earningSuspendedUntil > new Date()) return []
  const windows = await prisma.creatorAvailability.findMany({ where: {
    userId: creatorId, isActive: true, ...(type === "VOICE" ? { voiceEnabled: true } : { videoEnabled: true }),
  } })
  const now = new Date()
  const horizon = addDays(now, Math.min(31, Math.max(1, days)))
  const existing = await prisma.callBooking.findMany({ where: {
    creatorId, status: { in: ACTIVE }, scheduledStart: { lt: horizon }, scheduledEnd: { gt: now },
  } })
  const slots: Array<{ start: string; end: string; timezone: string }> = []
  for (let offset = 0; offset < days; offset++) {
    const probe = addDays(now, offset)
    for (const window of windows) {
      const local = partsInZone(probe, window.timezone)
      if (local.weekday !== window.weekday) continue
      const dayStart = zonedDate(local.year, local.month, local.day, 0, window.timezone)
      const dailyCount = existing.filter((b) => partsInZone(b.scheduledStart, window.timezone).day === local.day).length
      if (dailyCount >= window.maxSessionsDay) continue
      for (let minute = window.startMinute; minute + SESSION_MINUTES <= window.endMinute; minute += SESSION_MINUTES + BUFFER_MINUTES) {
        const start = addMinutes(dayStart, minute)
        const end = addMinutes(start, SESSION_MINUTES)
        if (start <= addMinutes(now, 30)) continue
        const clashes = existing.some((b) => start < addMinutes(b.scheduledEnd, BUFFER_MINUTES) && end > addMinutes(b.scheduledStart, -BUFFER_MINUTES))
        if (!clashes) slots.push({ start: start.toISOString(), end: end.toISOString(), timezone: window.timezone })
      }
    }
  }
  return slots.sort((a, b) => a.start.localeCompare(b.start))
}

export async function proposeBooking(customerId: string, input: { creatorId: string; type: BookingType; start: string; timezone: string }) {
  if (customerId === input.creatorId) throw new Error("You cannot book yourself")
  const start = new Date(input.start)
  if (!Number.isFinite(start.getTime())) throw new Error("Invalid start time")
  const slots = await availableSlots(input.creatorId, input.type, 31)
  if (!slots.some((s) => s.start === start.toISOString())) throw new Error("This slot is no longer available")
  const end = addMinutes(start, SESSION_MINUTES)
  const expires = new Date(Math.min(addMinutes(new Date(), 12 * 60).getTime(), addMinutes(start, -120).getTime()))
  if (expires <= new Date()) throw new Error("This slot can no longer be proposed")
  const field = input.type === "VOICE" ? "voiceSessions" : "videoSessions"
  const reserved = input.type === "VOICE" ? "reservedVoiceSessions" : "reservedVideoSessions"
  const booking = await prisma.$transaction(async (tx) => {
    await tx.creditAccount.upsert({ where: { userId: customerId }, create: { userId: customerId }, update: {} })
    const account = await tx.creditAccount.findUnique({ where: { userId: customerId } })
    const available = account ? account[field] - account[reserved] : 0
    const claimed = available > 0
      ? await tx.creditAccount.updateMany({ where: { userId: customerId, updatedAt: account!.updatedAt }, data: { [reserved]: { increment: 1 } } })
      : { count: 0 }
    if (!claimed.count) throw new Error(`You need an available ${input.type.toLowerCase()} session credit`)
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
  await notifyBooking(booking.creatorId, booking.customerId, "New call proposal", `A ${input.type.toLowerCase()} call has been proposed.`, booking.id, booking.creator.email)
  return booking
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

export async function bookingAction(userId: string, bookingId: string, action: string, reason?: string) {
  const booking = await prisma.callBooking.findUnique({ where: { id: bookingId }, include: { customer: true, creator: true } })
  if (!booking || (booking.customerId !== userId && booking.creatorId !== userId)) throw new Error("Booking not found")
  const isCreator = booking.creatorId === userId
  if (action === "approve") {
    if (!isCreator || booking.status !== "PROPOSED" || booking.proposalExpiresAt <= new Date()) throw new Error("This proposal cannot be approved")
    const updated = await prisma.callBooking.update({ where: { id: booking.id }, data: { status: "APPROVED", approvedAt: new Date() } })
    await notifyBooking(booking.customerId, booking.creatorId, "Call approved", "Your call proposal was approved.", booking.id, booking.customer.email)
    return updated
  }
  if (action === "decline") {
    if (!isCreator || booking.status !== "PROPOSED") throw new Error("This proposal cannot be declined")
    return prisma.$transaction(async (tx) => { await releaseBookingReservation(tx, booking); return tx.callBooking.update({ where: { id: booking.id }, data: { status: "DECLINED", declinedAt: new Date() } }) }, { timeout: 20000, maxWait: 10000 })
  }
  if (action === "cancel") {
    if (!["PROPOSED", "APPROVED"].includes(booking.status)) throw new Error("This booking cannot be cancelled")
    return prisma.$transaction(async (tx) => {
      if (isCreator || booking.scheduledStart.getTime() - Date.now() >= 12 * 3600_000) await releaseBookingReservation(tx, booking)
      else await settleBookedSession(tx, booking)
      return tx.callBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledAt: new Date(), endReason: reason } })
    }, { timeout: 20000, maxWait: 10000 })
  }
  if (action === "end") {
    if (!["APPROVED", "LIVE"].includes(booking.status)) throw new Error("This call cannot be ended")
    return prisma.$transaction(async (tx) => {
      if (isCreator && new Date() < booking.scheduledEnd) return tx.callBooking.update({ where: { id: booking.id }, data: { status: "UNDER_REVIEW", completedAt: new Date(), endReason: reason || "Creator ended early" } })
      await settleBookedSession(tx, booking)
      return tx.callBooking.update({ where: { id: booking.id }, data: { status: "COMPLETED", completedAt: new Date(), endReason: reason } })
    }, { timeout: 20000, maxWait: 10000 })
  }
  throw new Error("Unknown booking action")
}

export async function joinBooking(userId: string, bookingId: string) {
  const booking = await prisma.callBooking.findUnique({ where: { id: bookingId } })
  if (!booking || (booking.customerId !== userId && booking.creatorId !== userId) || !["APPROVED", "LIVE"].includes(booking.status)) throw new Error("Booking is not available")
  const now = new Date()
  if (now < addMinutes(booking.scheduledStart, -10) || now > addMinutes(booking.scheduledEnd, 5)) throw new Error("The call room is not open")
  return prisma.callBooking.update({ where: { id: booking.id }, data: {
    status: "LIVE", ...(userId === booking.customerId ? { customerJoinedAt: now } : { creatorJoinedAt: now }),
  } })
}

export async function reconcileBookings() {
  const now = new Date()
  const expired = await prisma.callBooking.findMany({ where: { status: "PROPOSED", proposalExpiresAt: { lte: now } } })
  for (const b of expired) await prisma.$transaction(async (tx) => { await releaseBookingReservation(tx, b); await tx.callBooking.update({ where: { id: b.id }, data: { status: "EXPIRED" } }) }, { timeout: 20000, maxWait: 10000 })
  const reminders = await prisma.callBooking.findMany({ where: { status: "APPROVED", reminderSentAt: null, scheduledStart: { gt: now, lte: addMinutes(now, 10) } }, include: { customer: true, creator: true } })
  for (const b of reminders) {
    await Promise.all([
      notifyBooking(b.customerId, b.creatorId, "Call starts in 10 minutes", "Your booked call starts soon.", b.id, b.customer.email),
      notifyBooking(b.creatorId, b.customerId, "Call starts in 10 minutes", "Your booked call starts soon.", b.id, b.creator.email),
    ])
    await prisma.callBooking.update({ where: { id: b.id }, data: { reminderSentAt: now } })
  }
  const late = await prisma.callBooking.findMany({ where: {
    status: { in: ["APPROVED", "LIVE"] }, creatorJoinedAt: null, creatorFineAppliedAt: null,
    scheduledStart: { lte: addMinutes(now, -2) }, scheduledEnd: { gt: now },
  } })
  for (const b of late) await prisma.$transaction(async (tx) => {
    const kind: CreditKind = b.type === "VOICE" ? "VOICE_SESSION" : "VIDEO_SESSION"
    await tx.earningLot.create({ data: {
      userId: b.creatorId, source: kind, sourceId: `late-fine:${b.id}`,
      amount: new Prisma.Decimal(-ON_ACCOUNT_VALUE_KES[kind] * 0.25), status: "AVAILABLE",
      heldReason: "25% creator lateness fine", availableAt: now,
    } })
    await tx.callBooking.update({ where: { id: b.id }, data: { creatorFineAppliedAt: now } })
  }, { timeout: 20000, maxWait: 10000 })
  const creatorNoShows = await prisma.callBooking.findMany({ where: {
    status: { in: ["APPROVED", "LIVE"] }, creatorJoinedAt: null,
    scheduledStart: { lte: addMinutes(now, -3) }, scheduledEnd: { gt: now },
  } })
  for (const b of creatorNoShows) await prisma.$transaction(async (tx) => {
    await releaseBookingReservation(tx, b)
    await tx.callBooking.update({ where: { id: b.id }, data: { status: "CREATOR_NO_SHOW", completedAt: now } })
    const count = await tx.creatorStrike.count({ where: { creatorId: b.creatorId, expiresAt: { gt: now } } })
    await tx.creatorStrike.create({ data: { creatorId: b.creatorId, bookingId: b.id, reason: "Creator did not join within three minutes", expiresAt: addDays(now, 3) } })
    if (count + 1 >= 3) await tx.user.update({ where: { id: b.creatorId }, data: { activeStrikeCount: count + 1, earningSuspendedUntil: addDays(now, 3) } })
  }, { timeout: 20000, maxWait: 10000 })
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

  const suspended = await prisma.user.findMany({ where: { earningSuspendedUntil: { lte: now } }, select: { id: true } })
  for (const user of suspended) {
    const active = await prisma.creatorStrike.count({ where: { creatorId: user.id, expiresAt: { gt: now } } })
    await prisma.user.update({ where: { id: user.id }, data: { activeStrikeCount: active, earningSuspendedUntil: active >= 3 ? addDays(now, 3) : null } })
  }
  return { expired: expired.length, reminded: reminders.length, fines: late.length, creatorNoShows: creatorNoShows.length, settled: due.length, autoRefunded: staleReview.length }
}
