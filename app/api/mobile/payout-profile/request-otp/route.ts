import { NextResponse } from "next/server"
import { VerificationChannel, VerificationPurpose } from "@prisma/client"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { sendOtpNotification } from "@/lib/notifications"
import { normalizePhoneNumber } from "@/lib/sms"

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const phone = normalizePhoneNumber(String((await request.json()).phoneNumber || ""))
  if (!phone) return NextResponse.json({ success: false, message: "Enter a valid M-PESA number" }, { status: 400 })
  const sent = await sendOtpNotification({ recipient: phone, channel: VerificationChannel.SMS, purpose: VerificationPurpose.PAYOUT_PHONE, userId: session.userId })
  return NextResponse.json({ success: sent.success, expiresAt: sent.expiresAt, message: sent.success ? "Verification code sent" : "SMS delivery failed" }, { status: sent.success ? 200 : 503 })
}
