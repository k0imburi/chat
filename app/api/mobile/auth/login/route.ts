import { NextResponse } from "next/server"
import { z } from "zod"
import { signMobileSessionToken } from "@/lib/mobile-session"
import {
  assertMobileUserCanAuthenticate,
  findMobileUserByEmail,
  mapMobileLoginProvider,
  serializeMobileUser,
  verifyMobileUserPassword,
} from "@/lib/mobile-users"
import { prisma } from "@/lib/prisma"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const user = await findMobileUserByEmail(parsed.email)

    if (!user || !(await verifyMobileUserPassword(user, parsed.password))) {
      return NextResponse.json({ success: false, message: "Invalid credentials" }, { status: 401 })
    }

    assertMobileUserCanAuthenticate(user)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastActiveAt: new Date(),
      },
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

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to sign in" },
      { status: 500 },
    )
  }
}
