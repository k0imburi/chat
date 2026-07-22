import { NextResponse } from "next/server"
import { z } from "zod"
import { getMessages, sendMessage, deleteMessage } from "@/lib/mobile-chats"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { logError } from "@/lib/log-error"

const paramsSchema = z.object({
  otherUserId: z.string().min(1),
})

const bodySchema = z.object({
  textMsg: z.string().optional(),
  previewText: z.string().max(20).optional(),
  textLength: z.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  imageObjectKey: z.string().max(1024).optional().or(z.literal("")),
  replyToId: z.string().optional(),
  replyToText: z.string().optional(),
  replyToSenderId: z.string().optional(),
  replyToSenderName: z.string().optional(),
})

export async function GET(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const params = paramsSchema.parse(await context.params)
    const { messages, willChargeReply } = await getMessages(session.userId, params.otherUserId)
    return NextResponse.json({ success: true, data: messages, willChargeReply })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }

    logError("/api/mobile/chats/[otherUserId]/messages", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to load messages" },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const params = paramsSchema.parse(await context.params)
    const url = new URL(request.url)
    const messageId = url.searchParams.get("messageId") || ""
    if (!messageId) {
      return NextResponse.json({ success: false, message: "messageId is required" }, { status: 400 })
    }
    await deleteMessage(session.userId, params.otherUserId, messageId)
    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to delete message"
    const status = msg.includes("only delete your own") ? 403 : msg.includes("not found") ? 404 : 500
    if (status === 500) logError("/api/mobile/chats/[otherUserId]/messages DELETE", error)
    return NextResponse.json({ success: false, message: msg }, { status })
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
      previewText: body.previewText,
      textLength: body.textLength,
      imageUrl: body.imageUrl,
      imageObjectKey: body.imageObjectKey,
      replyToId: body.replyToId,
      replyToText: body.replyToText,
      replyToSenderId: body.replyToSenderId,
      replyToSenderName: body.replyToSenderName,
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logError("/api/mobile/chats/[otherUserId]/messages", error)
      return NextResponse.json(
        { success: false, message: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      )
    }

    const msg = error instanceof Error ? error.message : "Failed to send message"
    // Return 400 for known user-facing validation errors so clients can
    // surface them directly. Everything else is a 500.
    const USER_ERRORS = [
      "100 characters",
      "private upload storage",
      "broadcast messages",
      "Message content is required",
      "Messaging is unavailable",
      "You cannot message",
      "Wait for a reply",
      "Unlock the conversation",
      "insufficient Balance",
    ]
    const isUserError = USER_ERRORS.some((e) => msg.includes(e))
    console.warn("[chat:messages] send rejected", {
      senderId: session.userId,
      receiverId: (await context.params).otherUserId,
      status: isUserError ? 400 : 500,
      message: msg,
    })
    return NextResponse.json({ success: false, message: msg }, { status: isUserError ? 400 : 500 })
  }
}
