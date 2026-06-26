import { NextResponse } from "next/server"
import { handleStkCallback } from "@/lib/mpesa"
import { finalizeCreditPurchaseByCheckoutId } from "@/lib/mobile-credits"
import { logError } from "@/lib/log-error"

export async function POST(request: Request) {
  const body = await request.json()
  const result = await handleStkCallback(body)

  // If this STK was a credit purchase, allocate the credits now that payment
  // is confirmed. No-ops for ordinary (wallet) MPESA callbacks.
  if (result.checkoutRequestId) {
    try {
      await finalizeCreditPurchaseByCheckoutId(result.checkoutRequestId, result.success)
    } catch (error) {
      logError("/api/lnmo/callbacks stk -> finalizeCreditPurchase", error)
    }
  }

  return NextResponse.json({ ResultCode: result.ResultCode, ResultDesc: result.ResultDesc })
}
