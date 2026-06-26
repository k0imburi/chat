import { NextResponse } from "next/server"
import { getMobileSessionFromRequest, signCheckoutToken } from "@/lib/mobile-session"
import { env } from "@/lib/env"
import { logError } from "@/lib/log-error"

// Mints a one-time checkout link the app can open in a browser so the user
// completes payment on the website.
export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  try {
    const token = await signCheckoutToken(session.userId)
    const base = env.APP_URL?.replace(/\/$/, "") || new URL(request.url).origin
    const url = `${base}/checkout?t=${encodeURIComponent(token)}`
    return NextResponse.json({ success: true, data: { url } })
  } catch (error) {
    logError("/api/mobile/credits/checkout-link", error)
    return NextResponse.json({ success: false, message: "Failed to create checkout link" }, { status: 500 })
  }
}
