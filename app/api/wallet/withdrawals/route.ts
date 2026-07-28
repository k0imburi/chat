import { NextResponse } from "next/server"
import { z } from "zod"
import { createWithdrawalRequest, getUserWithdrawals } from "@/lib/mobile-wallet"
import { logError } from "@/lib/log-error"
import { prisma } from "@/lib/prisma"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"

const postSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.string().min(1),
  destination: z.string().min(1),
  expectedRate: z.coerce.number().positive(),
  expectedFeePercent: z.coerce.number().min(0).max(100),
  quoteToken: z.string().min(1),
})

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const withdrawals = await getUserWithdrawals(session.userId)
  return NextResponse.json({ success: true, data: withdrawals })
}

export async function POST(request: Request) {
  try {
    const session = await getMobileSessionFromRequest(request)
    if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    const parsed = postSchema.parse(await request.json())

    const kyc = await prisma.creatorKyc.findUnique({ where: { userId: session.userId }, select: { status: true } })
    if (kyc?.status !== "APPROVED") {
      return NextResponse.json(
        { success: false, message: "Verify your identity before withdrawing." },
        { status: 403 },
      )
    }

    const withdrawal = await createWithdrawalRequest({ userId: session.userId, ...parsed })
    return NextResponse.json({
      success: true,
      message: "Withdrawal request sent successfully",
      data: withdrawal,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    logError("/api/wallet/withdrawals", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to create withdrawal" },
      { status: 500 },
    )
  }
}
