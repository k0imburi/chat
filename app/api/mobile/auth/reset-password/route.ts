import { NextResponse } from "next/server"
import { VerificationChannel, VerificationPurpose } from "@prisma/client"
import { z } from "zod"
import { hashPassword } from "@/lib/auth"
import { consumeVerificationCode } from "@/lib/notifications"
import { findMobileUserByEmail, findMobileUserByPhone } from "@/lib/mobile-users"
import { prisma } from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/sms"
import { logError } from "@/lib/log-error"

const schema = z.object({
  identifier: z.string().min(3),
  code: z.string().min(4).max(8),
  password: z.string().min(6),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const identifier = parsed.identifier.trim()
    const isEmail = identifier.includes("@")
    const recipient = isEmail ? identifier.toLowerCase() : normalizePhoneNumber(identifier)
    const channel = isEmail ? VerificationChannel.EMAIL : VerificationChannel.SMS

    if (!recipient) {
      return NextResponse.json({ success: false, message: "Invalid recovery contact" }, { status: 400 })
    }

    const verification = await consumeVerificationCode({
      recipient,
      channel,
      purpose: VerificationPurpose.PASSWORD_RESET,
      code: parsed.code,
    })

    if (!verification) {
      return NextResponse.json({ success: false, message: "Invalid or expired reset code" }, { status: 401 })
    }

    const user = isEmail ? await findMobileUserByEmail(recipient) : await findMobileUserByPhone(recipient)
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(parsed.password),
        loginProvider: user.loginProvider,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Password reset successful",
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    logError("/api/mobile/auth/reset-password", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to reset password" },
      { status: 500 },
    )
  }
}
