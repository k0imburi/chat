import { NextResponse } from "next/server"
import { VerificationChannel, VerificationPurpose } from "@prisma/client"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { consumeVerificationCode } from "@/lib/notifications"
import { normalizePhoneNumber } from "@/lib/sms"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const body = await request.json()
  const phone = normalizePhoneNumber(String(body.phoneNumber || ""))
  if (!phone) return NextResponse.json({ success: false, message: "Invalid M-PESA number" }, { status: 400 })
  const verified = await consumeVerificationCode({ recipient: phone, channel: VerificationChannel.SMS, purpose: VerificationPurpose.PAYOUT_PHONE, code: String(body.code || "") })
  if (!verified || verified.userId !== session.userId) return NextResponse.json({ success: false, message: "Invalid or expired code" }, { status: 401 })
  const existing = await prisma.payoutProfile.findUnique({ where: { userId: session.userId } })
  const changed = Boolean(existing?.mpesaPhone && existing.mpesaPhone !== phone)
  const data = await prisma.payoutProfile.upsert({ where: { userId: session.userId }, create: { userId: session.userId, mpesaPhone: phone, phoneVerifiedAt: new Date(), destinationChangedAt: new Date() }, update: {
    mpesaPhone: phone, phoneVerifiedAt: new Date(), ...(changed ? { destinationChangedAt: new Date() } : {}), pausedReason: null,
  } })
  return NextResponse.json({ success: true, data, safetyHoldUntil: changed ? new Date(Date.now() + 24 * 3600_000) : null })
}
