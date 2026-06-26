import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const profile = await prisma.payoutProfile.findUnique({ where: { userId: session.userId } })
  const safetyHoldUntil =
    profile?.destinationChangedAt
      ? new Date(profile.destinationChangedAt.getTime() + 24 * 3600_000)
      : null

  return NextResponse.json({
    success: true,
    data: profile
      ? {
          mpesaPhone: profile.mpesaPhone,
          phoneVerifiedAt: profile.phoneVerifiedAt,
          pausedReason: profile.pausedReason,
          safetyHoldUntil: safetyHoldUntil && safetyHoldUntil > new Date() ? safetyHoldUntil : null,
        }
      : null,
  })
}
