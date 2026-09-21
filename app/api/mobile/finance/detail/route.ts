import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { financeActivity, financeFinesAndStrikes } from "@/lib/mobile-finance"

// GET /api/mobile/finance/detail — per-earning activity list plus creator
// fines/strikes, for the wallet's detailed breakdown (beyond the summary
// totals already served by /api/mobile/finance).
export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const includeActivity = url.searchParams.get("includeActivity") !== "false"
  const rawSince = url.searchParams.get("activitySince")
  const parsedSince = rawSince ? new Date(rawSince) : null
  const activitySince = parsedSince && !Number.isNaN(parsedSince.getTime())
    ? parsedSince
    : undefined

  const [activity, finesAndStrikes] = await Promise.all([
    includeActivity
      ? financeActivity(session.userId, { since: activitySince })
      : Promise.resolve({ items: [] }),
    financeFinesAndStrikes(session.userId),
  ])

  return NextResponse.json({
    success: true,
    data: {
      items: activity.items,
      fines: finesAndStrikes.fines,
      strikes: finesAndStrikes.strikes,
    },
  })
}
