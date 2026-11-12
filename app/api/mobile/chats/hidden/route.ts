import { withChatIdentity } from "@/lib/chat-identity";
import { NextResponse } from "next/server";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { listHiddenChats, changeHiddenChatCode, changeSecureFolderCode } from "@/lib/mobile-chat-privacy";
import { logError } from "@/lib/log-error";
import { serializeMobileUser } from "@/lib/mobile-users";
import { prisma } from "@/lib/prisma";

async function GETHandler(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const code = new URL(request.url).searchParams.get("code") || "";
  try {
    const hidden = await listHiddenChats(session.userId, code);
    const secured = await prisma.secureFolderMessage.findMany({
      where: { ownerId: session.userId },
      select: { messageId: true },
    });
    const secureMessageIds = new Set(secured.map((row) => row.messageId));
    const chats = hidden.flatMap((entry) => {
      const peer = entry.thread.participants.find((participant) => participant.userId !== session.userId);
      if (!peer) return [];
      const self = entry.thread.participants.find((participant) => participant.userId === session.userId);
      const last = entry.thread.messages.find((message) => {
        if (secureMessageIds.has(message.id)) return false;
        if (message.type === "SYSTEM") return false;
        if (self?.clearedAt && message.sentAt <= self.clearedAt) return false;
        const deletedFor = Array.isArray(message.deletedForUserIds)
          ? message.deletedForUserIds as string[] : [];
        return !deletedFor.includes(session.userId);
      });
      return [{
        chatUserId: peer.userId,
        senderId: last?.senderId ?? "",
        msgType: last?.type.toLowerCase() ?? "text",
        lastMsg: last?.text || (last?.type === "DOCUMENT" ? "Document" : ""),
        sentAt: (last?.sentAt ?? self?.clearedAt ?? entry.hiddenAt).toISOString(),
        unread: 0,
        broadcastOnly: false,
        receiver: serializeMobileUser(peer.user),
        hiddenCodeGroupId: entry.codeGroupId,
        hideForAll: entry.hideForAll,
      }];
    });
    return NextResponse.json({ success: true, data: chats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to search hidden chats";
    const status = message.includes("4-digit") ? 400 : 500;
    if (status === 500) logError("GET /api/mobile/chats/hidden", error);
    return NextResponse.json({ success: false, message: status === 400 ? message : "Unable to search hidden chats" }, { status });
  }
}

async function POSTHandler(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { username?: string; action?: string; currentCode?: string; nextCode?: string; otherUserId?: string; peerUserId?: string; messageId?: string };
    if (body.action === "change_hidden_code") {
      const data = await changeHiddenChatCode(session.userId, body.currentCode || "", body.nextCode || "", body.otherUserId);
      return NextResponse.json({ success: true, data });
    }
    if (body.action === "change_vault_code") {
      const data = await changeSecureFolderCode(session.userId, body.currentCode || "", body.nextCode || "", body.peerUserId, body.messageId);
      return NextResponse.json({ success: true, data });
    }
    return NextResponse.json({ success: false, message: "Your secret code is required to unhide chats." }, { status: 403 });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
    if (status >= 500) logError("POST /api/mobile/chats/hidden", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to update hidden chats" }, { status });
  }
}


export const GET = withChatIdentity(GETHandler);
export const POST = withChatIdentity(POSTHandler);
