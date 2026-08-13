import { NextResponse } from "next/server"
import { endDueSessions, sendLiveCallNotices } from "@/lib/mobile-bookings"
import { prisma, withDbRetry } from "@/lib/prisma"

// Runs on its own fast timer (see server.mjs), separately from the minutely
// reconcile job, so the "call is live" notice can fire a few seconds BEFORE
// scheduledStart instead of up to a minute after it — and, symmetrically,
// so a booking whose slot just ended gets settled and both parties' call
// screens closed within a few seconds instead of up to a minute after.
const LOOKAHEAD_MS = 5_000

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ success: false }, { status: 401 })
  const now = new Date()
  await withDbRetry(() => sendLiveCallNotices(prisma, now, LOOKAHEAD_MS))
  await withDbRetry(() => endDueSessions(prisma, now))
  return NextResponse.json({ success: true })
}
