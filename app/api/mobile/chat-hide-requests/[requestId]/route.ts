import { withChatIdentity } from "@/lib/chat-identity";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { ChatPrivacyError, respondToHideRequest } from "@/lib/mobile-chat-privacy";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/log-error";
import { emitChatRealtimeToUser } from "@/lib/realtime";

const paramsSchema = z.object({ requestId: z.string().min(1) });
const bodySchema = z.object({ accept: z.boolean(), code: z.string().optional() });

async function POSTHandler(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const session = await getMobileSessionFromRequest(request);
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  try {
    const { requestId } = paramsSchema.parse(await context.params);
    const body = bodySchema.parse(await request.json());
    const data = await respondToHideRequest(session.userId, requestId, body.accept, body.code);
    const requestRow = await prisma.chatHideRequest.findUnique({
      where: { id: requestId },
      select: { requesterId: true, recipientId: true, threadId: true, action: true },
    });
    if (requestRow) {
      const actionPrefix = requestRow.action === "UNHIDE_FOR_ALL" ? "UNHIDE" : "HIDE";
      const text = `CHAT_${actionPrefix}_REQUEST:${body.accept ? "ACCEPTED" : "DECLINED"}`;
      const updated = await prisma.chatMessage.updateMany({
        where: { threadId: requestRow.threadId, replyToId: requestId, text: `CHAT_${actionPrefix}_REQUEST:PENDING` },
        data: { text },
      });
      if (updated.count) {
        const message = await prisma.chatMessage.findFirst({ where: { threadId: requestRow.threadId, replyToId: requestId }, orderBy: { sentAt: "desc" } });
        if (message) {
          const payload = {
            id: message.id,
            chatId: message.threadId,
            senderId: message.senderId,
            type: "system",
            textMsg: text,
            replyToId: requestId,
            isRead: false,
            deliveredAt: null,
            sentAt: message.sentAt.toISOString(),
          };
          for (const recipientId of [requestRow.requesterId, requestRow.recipientId]) {
            emitChatRealtimeToUser(recipientId, {
              channel: "chat",
              type: "message_updated",
              otherUserId: recipientId === requestRow.requesterId ? requestRow.recipientId : requestRow.requesterId,
              data: payload,
            });
          }
        }
      }
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
    if (error instanceof ChatPrivacyError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    logError("POST /api/mobile/chat-hide-requests/[requestId]", error);
    return NextResponse.json({ success: false, message: "Unable to respond to chat privacy request" }, { status: 500 });
  }
}


export const POST = withChatIdentity(POSTHandler);
