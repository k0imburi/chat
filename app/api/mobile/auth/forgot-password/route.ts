import { NextResponse } from "next/server"
import { z } from "zod"
import { findMobileUserByEmail, findMobileUserByPhone } from "@/lib/mobile-users"
import { sendPasswordResetNotifications } from "@/lib/notifications"
import { normalizePhoneNumber } from "@/lib/sms"

const schema = z.object({
  identifier: z.string().min(3),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const identifier = parsed.identifier.trim()
    const isEmail = identifier.includes("@")
    const normalizedPhone = isEmail ? null : normalizePhoneNumber(identifier)

    const user = isEmail
      ? await findMobileUserByEmail(identifier.toLowerCase())
      : normalizedPhone
        ? await findMobileUserByPhone(normalizedPhone)
        : null

    if (user) {
      await sendPasswordResetNotifications({
        userId: user.id,
        email: user.email,
        phone: user.phoneNumber,
        fullName: user.fullName,
      })
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists for that contact, recovery instructions have been sent.",
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to send password reset instructions" },
      { status: 500 },
    )
  }
}
