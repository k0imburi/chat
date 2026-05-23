import { NextResponse } from "next/server"
import { z } from "zod"
import { getStkRequestStatus } from "@/lib/mpesa"
import { settleSuccessfulStkWalletTopUp } from "@/lib/mobile-wallet"

const querySchema = z.object({
  merchantRequestID: z.string().optional(),
  checkoutRequestID: z.string().optional(),
  userId: z.string().optional(),
  settleWallet: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1"),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    merchantRequestID: url.searchParams.get("merchantRequestID") || undefined,
    checkoutRequestID: url.searchParams.get("checkoutRequestID") || undefined,
    userId: url.searchParams.get("userId") || undefined,
    settleWallet: url.searchParams.get("settleWallet") || undefined,
  })

  if (!parsed.success || (!parsed.data.merchantRequestID && !parsed.data.checkoutRequestID)) {
    return NextResponse.json(
      { success: false, message: "merchantRequestID or checkoutRequestID is required" },
      { status: 400 },
    )
  }

  const result = await getStkRequestStatus(parsed.data)

  if (parsed.data.settleWallet && result.status === 1) {
    const settlement = await settleSuccessfulStkWalletTopUp(parsed.data)
    return NextResponse.json({
      ...result,
      wallet_settled: settlement.settled,
      wallet_transaction: settlement.transaction,
    })
  }

  return NextResponse.json(result)
}
