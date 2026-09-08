import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getAutoTopupConfig, upsertAutoTopupConfig } from "@/lib/auto-topup"
import { logError } from "@/lib/log-error"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const config = await getAutoTopupConfig(session.userId)
  return NextResponse.json({
    success: true,
    data: {
      enabled: config?.enabled ?? false,
      configured: config !== null,
      method: config?.method ?? "MPESA",
      mpesaPhone: config?.mpesaPhone ?? null,
      hasSavedCard: Boolean(config?.paystackAuthCode),
      cardLast4: config?.cardLast4 ?? null,
      cardBrand: config?.cardBrand ?? null,
      keyThreshold: config?.keyThreshold ?? 1,
      keyRefill: config?.keyRefill ?? 1,
      chatThreshold: config?.chatThreshold ?? 1,
      chatRefill: config?.chatRefill ?? 5,
      voiceThreshold: config?.voiceThreshold ?? 1,
      voiceRefill: config?.voiceRefill ?? 1,
      videoThreshold: config?.videoThreshold ?? 1,
      videoRefill: config?.videoRefill ?? 1,
      lastTriggeredAt: config?.lastTriggeredAt ?? null,
      lastFailureAt: config?.lastFailureAt ?? null,
      lastFailureText: config?.lastFailureText ?? null,
    },
  })
}

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const body = await request.json()
    const num = (v: unknown) => (v === undefined ? undefined : Number(v))
    const config = await upsertAutoTopupConfig(session.userId, {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      method: body.method === "CARD" || body.method === "MPESA" ? body.method : undefined,
      mpesaPhone: body.mpesaPhone !== undefined ? String(body.mpesaPhone || "") : undefined,
      keyThreshold: num(body.keyThreshold),
      keyRefill: num(body.keyRefill),
      chatThreshold: num(body.chatThreshold),
      chatRefill: num(body.chatRefill),
      voiceThreshold: num(body.voiceThreshold),
      voiceRefill: num(body.voiceRefill),
      videoThreshold: num(body.videoThreshold),
      videoRefill: num(body.videoRefill),
    })
    return NextResponse.json({ success: true, data: { enabled: config.enabled, method: config.method } })
  } catch (error) {
    logError("/api/mobile/auto-topup", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to save auto top-up settings" },
      { status: 400 },
    )
  }
}
