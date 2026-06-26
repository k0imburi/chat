import { NextResponse } from "next/server"
import { handleStkCallback } from "@/lib/mpesa"
import { logError } from "@/lib/log-error"
import { fulfillVerifiedCreditAttempt, fulfillVerifiedTipAttempt } from "@/lib/payment-attempts"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    if (!rawBody || Buffer.byteLength(rawBody, "utf8") > 64 * 1024) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid callback" }, { status: 400 })
    }
    const body = JSON.parse(rawBody) as unknown
    const result = await handleStkCallback(body, rawBody)
    if (result.verified && result.attemptId && result.purpose === "CREDIT_PURCHASE") {
      await fulfillVerifiedCreditAttempt(result.attemptId)
    }
    if (result.verified && result.attemptId && result.purpose === "TIP") {
      await fulfillVerifiedTipAttempt(result.attemptId)
    }
    if (result.verified && result.checkoutRequestId) {
      await prisma.mpesaPaymentRequest.updateMany({
        where: { checkoutRequestId: result.checkoutRequestId },
        data: { status: "SUCCESS" },
      })
    }
    return NextResponse.json({ ResultCode: result.ResultCode, ResultDesc: result.ResultDesc })
  } catch (error) {
    logError("/api/lnmo/callbacks/stk", error)
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid callback" }, { status: 400 })
  }
}
