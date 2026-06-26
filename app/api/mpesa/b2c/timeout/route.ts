import { NextResponse } from "next/server"
import { settlePayout } from "@/lib/mobile-finance"

export async function POST(request: Request) {
  const body = await request.json()
  const payoutId = String(body.OriginatorConversationID || body?.Result?.OriginatorConversationID || "")
  if (payoutId) await settlePayout(payoutId, false, undefined, "M-PESA queue timeout")
  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" })
}
