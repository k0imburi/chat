import { NextResponse } from "next/server"
import { sendLiveCallNotices } from "@/lib/mobile-bookings"
import { prisma, withDbRetry } from "@/lib/prisma"

// Runs on its own fast timer (see server.mjs), separately from the minutely
// reconcile job, so the "call is live" notice can fire a few seconds BEFORE
// scheduledStart instead of up to a minute after it.
const LOOKAHEAD_MS = 5_000

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ success: false }, { status: 401 })
  await withDbRetry(() => sendLiveCallNotices(prisma, new Date(), LOOKAHEAD_MS))
  return NextResponse.json({ success: true })
}
