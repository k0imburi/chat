import { NextResponse } from "next/server"
import { readCheckoutToken } from "@/lib/mobile-session"

export async function POST(request: Request) {
  const token = String((await request.json()).token || "")
  const userId = await readCheckoutToken(token)
  if (!userId) return NextResponse.json({ success: false, message: "Invalid or expired link" }, { status: 401 })
  const response = NextResponse.json({ success: true })
  response.cookies.set("chatandtip_checkout", token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 30 * 60,
  })
  return response
}
