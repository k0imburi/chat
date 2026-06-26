import { NextResponse } from "next/server"
import { z } from "zod"
import { CUSTOMER_SESSION_COOKIE, signCustomerSession } from "@/lib/customer-auth"
import { assertMobileUserCanAuthenticate, findMobileUserByEmail, serializeMobileUserWithCounts, verifyMobileUserPassword } from "@/lib/mobile-users"
import { prisma } from "@/lib/prisma"

const schema = z.object({ email: z.string().email(), password: z.string().min(6).max(200) })

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json())
    const user = await findMobileUserByEmail(input.email)
    if (!user || !(await verifyMobileUserPassword(user, input.password))) return NextResponse.json({ success: false, message: "Invalid credentials" }, { status: 401 })
    assertMobileUserCanAuthenticate(user)
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastActiveAt: new Date() } })
    const response = NextResponse.json({ success: true, data: { user: await serializeMobileUserWithCounts(user) } })
    response.cookies.set(CUSTOMER_SESSION_COOKIE, await signCustomerSession(user.id), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60,
    })
    return response
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, message: "Enter a valid email and password" }, { status: 400 })
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to sign in" }, { status: 400 })
  }
}
