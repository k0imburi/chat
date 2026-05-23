import { NextResponse } from "next/server"
import { VerificationChannel, VerificationPurpose } from "@prisma/client"
import { z } from "zod"
import { sendOtpNotification } from "@/lib/notifications"
import { normalizePhoneNumber } from "@/lib/sms"

const schema = z.object({
  phoneNumber: z.string().min(9),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const normalizedPhone = normalizePhoneNumber(parsed.phoneNumber)

    if (!normalizedPhone) {
      return NextResponse.json({ success: false, message: "Enter a valid phone number" }, { status: 400 })
    }

    const result = await sendOtpNotification({
      recipient: normalizedPhone,
      channel: VerificationChannel.SMS,
      purpose: VerificationPurpose.PHONE_LOGIN,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, message: "SMS OTP delivery failed", details: result.result }, { status: 503 })
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent",
      verificationId: normalizedPhone,
      expiresAt: result.expiresAt.toISOString(),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to send OTP" }, { status: 500 })
  }
}
