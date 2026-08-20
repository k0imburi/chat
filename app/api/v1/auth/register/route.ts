import { LoginProvider } from "@prisma/client"
import { NextResponse } from "next/server"
import { z } from "zod"
import { CUSTOMER_SESSION_COOKIE, signCustomerSession } from "@/lib/customer-auth"
import { registerMobileUser, serializeMobileUserWithCounts } from "@/lib/mobile-users"
import { logError } from "@/lib/log-error"

// Minimum age to hold an account. Stated in both the Terms ("You must be at
// least 18 years old to create an account") and the Privacy Policy ("we do
// not knowingly collect personal information from anyone under 18"), so it is
// enforced here rather than trusted to the client.
const MIN_AGE_YEARS = 18

function ageOnDate(birthday: Date, on: Date) {
  let age = on.getUTCFullYear() - birthday.getUTCFullYear()
  const monthDelta = on.getUTCMonth() - birthday.getUTCMonth()
  // Birthday hasn't come round yet this year.
  if (monthDelta < 0 || (monthDelta === 0 && on.getUTCDate() < birthday.getUTCDate())) age -= 1
  return age
}

const schema = z.object({
  fullName: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Use at least 6 characters"),
  phoneNumber: z.string().optional(),
  username: z.string().optional(),
  birthday: z.string().min(1, "Enter your date of birth"),
  // Consent is part of the request, not just a UI checkbox — a client that
  // skips the box can't create an account either.
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Terms and Privacy Policy" }),
  }),
})

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json())

    const birthday = new Date(input.birthday)
    if (Number.isNaN(birthday.getTime())) {
      return NextResponse.json({ success: false, message: "Enter a valid date of birth" }, { status: 400 })
    }
    if (ageOnDate(birthday, new Date()) < MIN_AGE_YEARS) {
      return NextResponse.json(
        { success: false, message: `You must be at least ${MIN_AGE_YEARS} to use ChatAndTip.` },
        { status: 400 },
      )
    }

    const user = await registerMobileUser({
      fullName: input.fullName,
      email: input.email,
      password: input.password,
      phoneNumber: input.phoneNumber,
      username: input.username,
      birthday: input.birthday,
      loginProvider: LoginProvider.EMAIL,
    })
    const response = NextResponse.json({
      success: true,
      data: { user: await serializeMobileUserWithCounts(user) },
    })
    response.cookies.set(CUSTOMER_SESSION_COOKIE, await signCustomerSession(user.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    })
    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }
    logError("/api/v1/auth/register", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to create account" },
      { status: 400 },
    )
  }
}
