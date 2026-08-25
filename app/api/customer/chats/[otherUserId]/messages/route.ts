import { NextResponse } from "next/server"
import { z } from "zod"
import { deleteMessage, getMessages, sendMessage } from "@/lib/mobile-chats"
import { getCurrentCustomerUser } from "@/lib/customer-web"
import { logError } from "@/lib/log-error"

// Mirrors app/api/mobile/chats/[otherUserId]/messages/route.ts field for
// field. The two exist side by side rather than sharing one route because
// they authenticate differently (cookie session vs mobile bearer token),
// not because the chat feature itself is meant to differ between web and
// app — it is the same lib/mobile-chats.ts underneath either way.

const paramsSchema = z.object({
  otherUserId: z.string().min(1),
})

const bodySchema = z.object({
  textMsg: z.string().optional(),
  previewText: z.string().max(20).optional(),
  textLength: z.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  imageObjectKey: z.string().max(1024).optional().or(z.literal("")),
  videoUrl: z.string().url().optional().or(z.literal("")),
  videoObjectKey: z.string().max(1024).optional().or(z.literal("")),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  thumbnailObjectKey: z.string().max(1024).optional().or(z.literal("")),
  replyToId: z.string().optional(),
  replyToText: z.string().optional(),
  replyToSenderId: z.string().optional(),
  replyToSenderName: z.string().optional(),
})

export async function GET(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const params = paramsSchema.parse(await context.params)
    const { messages, willChargeReply, turnTakingRequired, cycleState, viewerIsInitiator, unlockExpiresAt } =
      await getMessages(viewer.userId, params.otherUserId)
    return NextResponse.json({
      success: true,
      data: messages,
      willChargeReply,
      turnTakingRequired,
      cycleState,
      viewerIsInitiator,
      unlockExpiresAt,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }
    logError("/api/customer/chats/[otherUserId]/messages", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to load messages" },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const params = paramsSchema.parse(await context.params)
    const url = new URL(request.url)
    const messageId = url.searchParams.get("messageId") || ""
    if (!messageId) {
      return NextResponse.json({ success: false, message: "messageId is required" }, { status: 400 })
    }
    await deleteMessage(viewer.userId, params.otherUserId, messageId)
    return NextResponse.json({ success: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to delete message"
    const status = msg.includes("only delete your own") ? 403 : msg.includes("not found") ? 404 : 500
    if (status === 500) logError("/api/customer/chats/[otherUserId]/messages DELETE", error)
    return NextResponse.json({ success: false, message: msg }, { status })
  }
}

export async function POST(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const viewer = await getCurrentCustomerUser()
  if (!viewer) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  try {
    const params = paramsSchema.parse(await context.params)
    const body = bodySchema.parse(await request.json())
    const data = await sendMessage({
      senderId: viewer.userId,
      receiverId: params.otherUserId,
      textMsg: body.textMsg,
      previewText: body.previewText,
      textLength: body.textLength,
      imageUrl: body.imageUrl,
      imageObjectKey: body.imageObjectKey,
      videoUrl: body.videoUrl,
      videoObjectKey: body.videoObjectKey,
      thumbnailUrl: body.thumbnailUrl,
      thumbnailObjectKey: body.thumbnailObjectKey,
      replyToId: body.replyToId,
      replyToText: body.replyToText,
      replyToSenderId: body.replyToSenderId,
      replyToSenderName: body.replyToSenderName,
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      )
    }
    const msg = error instanceof Error ? error.message : "Failed to send message"
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
    if (!isUserError) logError("/api/customer/chats/[otherUserId]/messages POST", error)
    return NextResponse.json({ success: false, message: msg }, { status: isUserError ? 400 : 500 })
  }
}
