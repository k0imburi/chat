import { withChatIdentity } from "@/lib/chat-identity";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCustomerOrMobileSession } from "@/lib/customer-mobile-session";
import { cancelPendingHideRequest, hideChatForMe, requestHideForAll, requestUnhideForAll, ChatPrivacyError } from "@/lib/mobile-chat-privacy";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/log-error";
import { emitChatRealtimeToUser } from "@/lib/realtime";

const paramsSchema = z.object({ otherUserId: z.string().min(1) });
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("hide_for_me"), code: z.string() }),
  z.object({ action: z.literal("hide_for_all"), code: z.string() }),
  z.object({ action: z.literal("unhide_for_me") }),
  z.object({ action: z.literal("unhide_for_all") }),
]);

async function POSTHandler(request: Request, context: { params: Promise<{ otherUserId: string }> }) {
  const session = await getCustomerOrMobileSession(request);
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  try {
    const { otherUserId } = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await request.json());
    let data: unknown;
    if (body.action === "hide_for_me") data = await hideChatForMe(session.userId, otherUserId, body.code);
    else if (body.action === "hide_for_all") {
      data = await requestHideForAll(session.userId, otherUserId, body.code);
    } else if (body.action === "unhide_for_me") {
      const participant = await prisma.chatParticipant.findFirst({ where: { userId: session.userId, otherUserId }, select: { threadId: true } });
      if (!participant) throw new ChatPrivacyError("Conversation not found.", 404);
      const withdrawn = await cancelPendingHideRequest(session.userId, participant.threadId, "WITHDRAWN");
      const hidden = await prisma.userHiddenChat.findUnique({ where: { userId_threadId: { userId: session.userId, threadId: participant.threadId } } });
      if (hidden?.hideForAll) throw new ChatPrivacyError("Both people must agree to unhide this chat.", 409);
      await prisma.userHiddenChat.deleteMany({ where: { userId: session.userId, threadId: participant.threadId, hideForAll: false } });
      data = { unhidden: true, withdrawnHideRequest: withdrawn };
    } else {
      const participant = await prisma.chatParticipant.findFirst({ where: { userId: session.userId, otherUserId }, select: { threadId: true } });
      if (!participant) throw new ChatPrivacyError("Conversation not found.", 404);
      const withdrawn = await cancelPendingHideRequest(session.userId, participant.threadId, "WITHDRAWN");
      if (withdrawn) {
        await prisma.userHiddenChat.deleteMany({ where: { userId: session.userId, threadId: participant.threadId } });
        data = { unhidden: true, withdrawnHideRequest: true };
      } else {
        data = await requestUnhideForAll(session.userId, otherUserId);
      }
      if ((data as { withdrawnHideRequest?: boolean }).withdrawnHideRequest) return NextResponse.json({ success: true, data });
      const { requestId } = data as { requestId: string };
      const sentAt = new Date();
      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.chatMessage.create({
          data: {
            threadId: participant.threadId,
            senderId: session.userId,
            type: "SYSTEM",
            text: "CHAT_UNHIDE_REQUEST:PENDING",
            replyToId: requestId,
            sentAt,
          },
        });
        await tx.chatThread.update({
          where: { id: participant.threadId },
          data: { lastMessageText: "A chat partner asked to unhide this conversation for both of you.", lastMessageType: "SYSTEM", lastMessageAt: sentAt },
        });
        await tx.chatParticipant.updateMany({
          where: { threadId: participant.threadId, userId: otherUserId },
          data: { unreadCount: { increment: 1 }, archived: false },
        });
        await tx.userNotification.updateMany({
          where: { userId: otherUserId, type: "chat_unhide_request", hiddenAt: null, metadata: { path: "$.requestId", equals: requestId } },
          data: { hiddenAt: sentAt },
        });
        return created;
      });
      const payload = {
        id: message.id,
        chatId: participant.threadId,
        senderId: session.userId,
        type: "system",
        textMsg: message.text,
        replyToId: requestId,
        isRead: false,
        deliveredAt: null,
        sentAt: sentAt.toISOString(),
      };
      for (const recipientId of [session.userId, otherUserId]) {
        emitChatRealtimeToUser(recipientId, {
          channel: "chat",
          type: "message_created",
          otherUserId: recipientId === session.userId ? otherUserId : session.userId,
          data: payload,
        });
      }
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
    if (error instanceof ChatPrivacyError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    logError("POST /api/mobile/chats/[otherUserId]/hide", error);
    return NextResponse.json({ success: false, message: "Unable to update chat privacy" }, { status: 500 });
  }
}


export const POST = withChatIdentity(POSTHandler, getCustomerOrMobileSession);
