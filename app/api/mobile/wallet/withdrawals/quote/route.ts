import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getWithdrawalQuote, signWithdrawalQuote } from "@/lib/mobile-wallet"

const schema = z.object({ amount: z.coerce.number().positive() })

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const { amount } = schema.parse({ amount: new URL(request.url).searchParams.get("amount") })
    const quote = await getWithdrawalQuote(session.userId, amount)
    const quoteToken = await signWithdrawalQuote({
      userId: session.userId,
      grossUsd: quote.grossUsd,
      rate: quote.rate,
      feePercent: quote.feePercent,
      expiresAt: quote.expiresAt,
    })
    return NextResponse.json({ success: true, data: {
      grossUsd: Number(quote.grossUsd),
      feeUsd: Number(quote.feeUsd),
      netUsd: Number(quote.netUsd),
      netKes: Number(quote.netKes),
      exchangeRate: Number(quote.rate),
      feePercent: Number(quote.feePercent),
      maturedAvailableKes: Number(quote.maturedAvailableKes),
      outstandingFinesKes: Number(quote.outstandingFinesKes),
      withdrawableKes: Number(quote.withdrawableKes),
      withdrawableUsd: Number(quote.withdrawableUsd),
      minimumNetUsd: 40,
      minimumShortfallUsd: Number(quote.minimumShortfallUsd),
      expiresAt: quote.expiresAt.toISOString(),
      quoteToken,
    } })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to quote withdrawal" }, { status: 400 })
  }
}
