import { NextResponse } from "next/server"
import { z } from "zod"
import {
  completePendingTipRequests,
  getTipRequests,
  markTipAsSent,
  sendTipRequest,
} from "@/lib/mobile-tip-requests"
import { logError } from "@/lib/log-error"

const getSchema = z.object({
  userId: z.string().min(1),
})

const postSchema = z.object({
  senderId: z.string().min(1),
  receiverId: z.string().min(1),
  amount: z.coerce.number().positive(),
})

const patchSchema = z.object({
  action: z.enum(["mark_sent", "complete_pending"]),
  receiverId: z.string().min(1),
  tipRequestId: z.string().optional(),
  senderId: z.string().optional(),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = getSchema.safeParse({
    userId: url.searchParams.get("userId") || "",
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 })
  }

  const requests = await getTipRequests(parsed.data.userId)
  return NextResponse.json({ success: true, data: requests })
}

export async function POST(request: Request) {
  try {
    const parsed = postSchema.parse(await request.json())
    const tipRequest = await sendTipRequest(parsed)
    return NextResponse.json({ success: true, data: tipRequest })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    logError("/api/tip-requests", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to create tip request" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = patchSchema.parse(await request.json())

    if (parsed.action === "mark_sent") {
      if (!parsed.tipRequestId) {
        return NextResponse.json({ success: false, message: "tipRequestId is required" }, { status: 400 })
      }

      const tipRequest = await markTipAsSent(parsed.receiverId, parsed.tipRequestId)
      return NextResponse.json({ success: true, data: tipRequest })
    }

    if (!parsed.senderId) {
      return NextResponse.json({ success: false, message: "senderId is required" }, { status: 400 })
    }

    const result = await completePendingTipRequests(parsed.receiverId, parsed.senderId)
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    logError("/api/tip-requests", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to update tip request" },
      { status: 500 },
    )
  }
}
