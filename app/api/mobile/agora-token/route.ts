import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { logError } from "@/lib/log-error"
import { RtcTokenBuilder, RtcRole } from "agora-access-token"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get("channelId") ?? ""
    const uid = parseInt(searchParams.get("uid") ?? "0", 10)

    if (!channelId) {
      return NextResponse.json(
        { success: false, message: "channelId is required" },
        { status: 400 },
      )
    }

    const appId = process.env.AGORA_APP_ID
    const appCertificate = process.env.AGORA_APP_CERTIFICATE

    if (!appId || !appCertificate) {
      return NextResponse.json(
        { success: false, message: "Agora credentials not configured" },
        { status: 500 },
      )
    }

    const expiresAt = Math.floor(Date.now() / 1000) + 3600 // 1 hour

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelId,
      uid,
      RtcRole.PUBLISHER,
      expiresAt,
    )

    return NextResponse.json({ success: true, data: { token } })
  } catch (error) {
    logError("/api/mobile/agora-token", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to generate token" },
      { status: 500 },
    )
  }
}
