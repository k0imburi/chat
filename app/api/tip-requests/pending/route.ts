import { NextResponse } from "next/server"
import { z } from "zod"
import { hasPendingTipRequest } from "@/lib/mobile-tip-requests"

const schema = z.object({
  userId: z.string().min(1),
  senderId: z.string().min(1),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = schema.safeParse({
    userId: url.searchParams.get("userId") || "",
    senderId: url.searchParams.get("senderId") || "",
  })

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "userId and senderId are required" },
      { status: 400 },
    )
  }

  const result = await hasPendingTipRequest(parsed.data.userId, parsed.data.senderId)
  return NextResponse.json({ success: true, ...result })
}
