import { NextResponse } from "next/server"

// Legacy arbitrary-amount STK initiation is intentionally disabled. Purchases
// must start through an authenticated, server-priced checkout that creates an
// immutable PaymentAttempt before contacting Daraja.
export async function POST() {
  return NextResponse.json(
    { success: false, message: "Use the authenticated ChatAndTip checkout" },
    { status: 410 },
  )
}
