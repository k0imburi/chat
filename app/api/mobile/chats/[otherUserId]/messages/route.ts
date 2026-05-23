import { NextResponse } from "next/server"
import { z } from "zod"
import { getMessages, sendMessage } from "@/lib/mobile-chats"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"

const paramsSchema = z.object({
  otherUserId: z.string().min(1),
})

const bodySchema = z.object({
  textMsg: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
})

export async function GET(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const params = paramsSchema.parse(await context.params)
    const data = await getMessages(session.userId, params.otherUserId)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to load messages" },
      { status: 500 },
    )
  }
}

export async function POST(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const params = paramsSchema.parse(await context.params)
    const body = bodySchema.parse(await request.json())
    const data = await sendMessage({
      senderId: session.userId,
      receiverId: params.otherUserId,
      textMsg: body.textMsg,
      imageUrl: body.imageUrl,
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to send message" },
      { status: 500 },
    )
  }
}
