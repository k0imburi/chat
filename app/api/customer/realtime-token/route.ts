import { NextResponse } from "next/server"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { signRealtimeToken } from "@/lib/mobile-session"

// Short-lived on purpose (see signRealtimeToken) — the client refetches this
// well before expiry rather than treating it as a long-lived credential.
export const dynamic = "force-dynamic"

export async function GET() {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return NextResponse.json({ success: false, message: "Sign in required" }, { status: 401 })

  const token = await signRealtimeToken(viewer.userId)
  return NextResponse.json({ success: true, token })
}
