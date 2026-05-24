import { NextResponse } from "next/server"
import { LoginProvider, VerificationChannel, VerificationPurpose } from "@prisma/client"
import { z } from "zod"
import { signMobileSessionToken } from "@/lib/mobile-session"
import { consumeVerificationCode } from "@/lib/notifications"
import { mapMobileLoginProvider, serializeMobileUser, upsertMobileProviderUser } from "@/lib/mobile-users"
import { normalizePhoneNumber } from "@/lib/sms"
import { logError } from "@/lib/log-error"

const schema = z.object({
  phoneNumber: z.string().min(9),
  code: z.string().min(4).max(8),
  deviceSystem: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const normalizedPhone = normalizePhoneNumber(parsed.phoneNumber)

    if (!normalizedPhone) {
      return NextResponse.json({ success: false, message: "Enter a valid phone number" }, { status: 400 })
    }

    const verification = await consumeVerificationCode({
      recipient: normalizedPhone,
      channel: VerificationChannel.SMS,
      purpose: VerificationPurpose.PHONE_LOGIN,
      code: parsed.code,
    })

    if (!verification) {
      return NextResponse.json({ success: false, message: "Invalid or expired verification code" }, { status: 401 })
    }

    const user = await upsertMobileProviderUser({
      provider: LoginProvider.PHONE,
      providerUserId: normalizedPhone,
      phoneNumber: normalizedPhone,
      fullName: normalizedPhone,
      deviceSystem: parsed.deviceSystem,
    })

    const token = await signMobileSessionToken({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      loginProvider: mapMobileLoginProvider(user.loginProvider),
    })

    return NextResponse.json({
      success: true,
      token,
      user: serializeMobileUser(user),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    logError("/api/mobile/auth/verify-otp", error)
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to verify OTP" }, { status: 500 })
  }
}
