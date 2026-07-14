import { NextResponse } from "next/server"
import { z } from "zod"
import { createWithdrawalRequest, getUserWithdrawals } from "@/lib/mobile-wallet"
import { logError } from "@/lib/log-error"
import { prisma } from "@/lib/prisma"

const MIN_WITHDRAWAL_USD = 40

const getSchema = z.object({
  userId: z.string().min(1),
})

const postSchema = z.object({
  userId: z.string().min(1),
  amount: z.coerce.number().min(MIN_WITHDRAWAL_USD, `Minimum withdrawal is $${MIN_WITHDRAWAL_USD}`),
  method: z.string().min(1),
  destination: z.string().min(1),
  status: z.string().optional(),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = getSchema.safeParse({
    userId: url.searchParams.get("userId") || "",
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 })
  }

  const withdrawals = await getUserWithdrawals(parsed.data.userId)
  return NextResponse.json({ success: true, data: withdrawals })
}

export async function POST(request: Request) {
  try {
    const parsed = postSchema.parse(await request.json())

    const kyc = await prisma.creatorKyc.findUnique({ where: { userId: parsed.userId }, select: { status: true } })
    if (kyc?.status !== "APPROVED") {
      return NextResponse.json(
        { success: false, message: "Verify your identity before withdrawing." },
        { status: 403 },
      )
    }

    const withdrawal = await createWithdrawalRequest(parsed)
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
