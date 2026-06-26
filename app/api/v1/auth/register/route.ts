import { LoginProvider } from "@prisma/client"
import { NextResponse } from "next/server"
import { z } from "zod"
import { CUSTOMER_SESSION_COOKIE, signCustomerSession } from "@/lib/customer-auth"
import { registerMobileUser, serializeMobileUserWithCounts } from "@/lib/mobile-users"
import { logError } from "@/lib/log-error"

const schema = z.object({
  fullName: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Use at least 6 characters"),
  phoneNumber: z.string().optional(),
  username: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json())
    const user = await registerMobileUser({
      ...input,
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
