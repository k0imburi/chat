import { withChatIdentity } from "@/lib/chat-identity";
import { NextResponse } from "next/server"
import { z } from "zod"
import { getMessages, sendMessage, deleteMessage, markMessagesDelivered } from "@/lib/mobile-chats"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { claimLegacyVaultUpload } from '@/lib/vault-accounting'
import { logError } from "@/lib/log-error"

const paramsSchema = z.object({
  otherUserId: z.string().min(1),
})

const bodySchema = z.object({
  albumId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
  textMsg: z.string().optional(),
  previewText: z.string().max(20).optional(),
  textLength: z.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  imageObjectKey: z.string().max(1024).optional().or(z.literal("")),
  videoUrl: z.string().url().optional().or(z.literal("")),
  videoObjectKey: z.string().max(1024).optional().or(z.literal("")),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  thumbnailObjectKey: z.string().max(1024).optional().or(z.literal("")),
  documentObjectKey: z.string().max(1024).optional().or(z.literal("")),
  documentName: z.string().max(255).optional(),
  documentMimeType: z.string().max(191).optional(),
  documentSizeBytes: z.number().int().nonnegative().max(25 * 1024 * 1024).optional(),
  replyToId: z.string().optional(),
  replyToText: z.string().optional(),
  replyToSenderId: z.string().optional(),
  replyToSenderName: z.string().optional(),
  hiddenCodeGroupId: z.string().optional(),
})

async function GETHandler(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const params = paramsSchema.parse(await context.params)
    const {
      messages,
      willChargeReply,
      turnTakingRequired,
      cycleState,
      viewerIsInitiator,
      unlockExpiresAt,
      entityCanReply,
      entityChatEnded,
    } = await getMessages(
      session.userId,
      params.otherUserId,
      new URL(request.url).searchParams.get("hiddenCodeGroupId") || undefined,
    )
    return NextResponse.json({
      success: true,
      data: messages,
      willChargeReply,
      turnTakingRequired,
      cycleState,
      viewerIsInitiator,
      unlockExpiresAt,
      entityCanReply,
      entityChatEnded,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    }

    logError("/api/mobile/chats/[otherUserId]/messages", error)
    const message = error instanceof Error ? error.message : "Failed to load messages"
    return NextResponse.json(
      { success: false, message },
      { status: message.includes("This action cannot be completed") ? 403 : 500 },
    )
  }
}

async function DELETEHandler(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
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

async function POSTHandler(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const params = paramsSchema.parse(await context.params)
    const body = bodySchema.parse(await request.json())
    if (params.otherUserId === session.userId && body.textMsg === '__CHATANDTIP_VAULT_DIRECT_UPLOAD__') {
      const key = body.imageObjectKey || body.videoObjectKey || body.documentObjectKey
      if (!key) return NextResponse.json({success:false,message:'Vault upload is missing'}, {status:400})
      await claimLegacyVaultUpload(session.userId,key)
    }
    const data = await sendMessage({
      senderId: session.userId,
      albumId: body.albumId,
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
      documentObjectKey: body.documentObjectKey,
      documentName: body.documentName,
      documentMimeType: body.documentMimeType,
      documentSizeBytes: body.documentSizeBytes,
      replyToId: body.replyToId,
      replyToText: body.replyToText,
      replyToSenderId: body.replyToSenderId,
      replyToSenderName: body.replyToSenderName,
      hiddenCodeGroupId: body.hiddenCodeGroupId,
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
    if (typeof error === 'object' && error && 'status' in error && Number(error.status) === 413) return NextResponse.json({success:false,message:msg},{status:413})
    // Return 400 for known user-facing validation errors so clients can
    // surface them directly. Everything else is a 500.
    const USER_ERRORS = [
      "100 characters",
      "private upload storage",
      "one attachment type",
      "broadcast messages",
      "Message content is required",
      "Messaging is unavailable",
      "You cannot message",
      "Wait for a reply",
      "Unlock the conversation",
      "insufficient Balance",
      "Purchase a plan",
      "must be verified",
      "daily reply limit",
      "Entity accounts can only reply",
      "Entity accounts can only reply to individual users",
      "This action cannot be completed.",
      "This user has not initiated contact yet.",
      "This chat has ended",
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


export const GET = withChatIdentity(GETHandler);
export const DELETE = withChatIdentity(DELETEHandler);
export const POST = withChatIdentity(POSTHandler);
