import { NextResponse } from "next/server"
import { env } from "@/lib/env"
import { purgeExpiredDeactivatedAccounts } from "@/lib/account-deactivation"

export async function POST(request: Request) {
  if (!env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  const purged = await purgeExpiredDeactivatedAccounts()
  return NextResponse.json({ success: true, purged })
}
