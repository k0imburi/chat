import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { financeSummary } from "@/lib/mobile-finance"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const summary = await financeSummary(session.userId)
  return NextResponse.json({
    success: true,
    data: {
      ...summary,
      // Lifetime earnings = what's still on the books (pending/held/available/
      // reserved) plus what's already been paid out.
      totalEarnedKes: summary.currentBalanceKes + summary.totalPaidOutKes,
    },
  })
}
