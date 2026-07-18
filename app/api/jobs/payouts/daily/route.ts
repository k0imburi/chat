import { NextResponse } from "next/server"
import { runPayoutBatch } from "@/lib/mobile-finance"
import { withDbRetry } from "@/lib/prisma"

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ success: false }, { status: 401 })
  return NextResponse.json({ success: true, data: await withDbRetry(() => runPayoutBatch()) })
}
