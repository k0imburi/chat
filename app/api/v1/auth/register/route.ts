import { NextResponse } from "next/server"

// Web account creation is intentionally disabled — users register in the
// ChatAndTip mobile app. To re-enable, restore the previous implementation
// from git history (it called registerMobileUser + signed a customer session).
export async function POST() {
  return NextResponse.json(
    { success: false, message: "Sign up in the ChatAndTip app to create an account." },
    { status: 403 },
  )
}
