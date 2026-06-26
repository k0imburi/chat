import { NextResponse } from "next/server"
import { settlePayout } from "@/lib/mobile-finance"

export async function POST(request: Request) {
  const body = await request.json()
  const result = body?.Result || body?.result || {}
  const payoutId = String(result.OriginatorConversationID || "")
  if (payoutId) await settlePayout(payoutId, Number(result.ResultCode) === 0, String(result.ConversationID || "") || undefined, String(result.ResultDesc || "") || undefined)
  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" })
}
