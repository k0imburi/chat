import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getTipWallet } from "@/lib/mobile-tip-wallet"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const wallet = await getTipWallet(session.userId)
  return NextResponse.json({ success: true, data: wallet })
}
