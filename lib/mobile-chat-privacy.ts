import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import {
  AccountType,
  ChatHideRequestAction,
  ChatHideRequestStatus,
  ChatMessageType,
  ChatThreadKind,
  PrivateCodePurpose,
  Prisma,
} from "@prisma/client";
import { encryptVaultSecret } from "@/lib/vault-secrets";
import { env } from "@/lib/env";
import { isWebVaultMedia } from "@/lib/vault-media-storage";
import { prisma } from "@/lib/prisma";
import { getSignedPrivateR2DownloadUrl } from "@/lib/r2";
import { serializeMobileUser } from "@/lib/mobile-users";
import { emitChatRealtimeToUser } from "@/lib/realtime";

export class ChatPrivacyError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ChatPrivacyError";
  }
}

export async function expireUnansweredUnhideRequests(userId: string) {
  const now = new Date();
  const expired = await prisma.chatHideRequest.findMany({
    where: {
      status: ChatHideRequestStatus.PENDING,
      action: ChatHideRequestAction.UNHIDE_FOR_ALL,
      OR: [{ recipientId: userId }, { requesterId: userId }],
      createdAt: { lte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true, requesterId: true, recipientId: true, threadId: true },
  });
  if (!expired.length) return;
  const completed = await prisma.$transaction(async (tx) => {
    const completed: typeof expired = [];
    for (const request of expired) {
      const changed = await tx.chatHideRequest.updateMany({
        where: { id: request.id, status: ChatHideRequestStatus.PENDING },
        data: { status: ChatHideRequestStatus.EXPIRED },
      });
      if (!changed.count) continue;
      await tx.chatMessage.updateMany({
        where: { threadId: request.threadId, replyToId: request.id, text: "CHAT_UNHIDE_REQUEST:PENDING" },
        data: { text: "CHAT_UNHIDE_REQUEST:EXPIRED" },
      });
      await tx.userNotification.updateMany({
        where: {
          userId: request.recipientId,
          type: "chat_unhide_request",
          hiddenAt: null,
          metadata: { path: "$.requestId", equals: request.id },
        },
        data: { hiddenAt: now },
      });
      completed.push(request);
    }
    return completed;
  });
  for (const request of completed) {
    for (const user of [request.requesterId, request.recipientId]) {
      emitChatRealtimeToUser(user, {
        channel: "chat", type: "chat_privacy_updated",
        otherUserId: user === request.requesterId ? request.recipientId : request.requesterId,
      });
    }
  }
}

export async function expirePendingHideRequests(userId: string) {
  const now = new Date();
  const expired = await prisma.chatHideRequest.findMany({
    where: {
      status: ChatHideRequestStatus.PENDING,
      action: ChatHideRequestAction.HIDE_FOR_ALL,
      OR: [{ recipientId: userId }, { requesterId: userId }],
      expiresAt: { lte: now },
    },
    select: { id: true, requesterId: true, recipientId: true, threadId: true },
  });
  for (const request of expired) {
    const message = await prisma.$transaction(async (tx) => {
      const changed = await tx.chatHideRequest.updateMany({
        where: { id: request.id, status: ChatHideRequestStatus.PENDING },
        data: { status: ChatHideRequestStatus.EXPIRED },
      });
      if (!changed.count) return null;
      await tx.chatMessage.updateMany({
        where: { threadId: request.threadId, replyToId: request.id, text: "CHAT_HIDE_REQUEST:PENDING" },
        data: { text: "CHAT_HIDE_REQUEST:EXPIRED" },
      });
      // An unanswered hide-for-all request becomes asymmetric after 24h:
      // the requester gets the chat back, while the recipient keeps it
      // hidden locally instead of leaving both sides in a pending state.
      await tx.userHiddenChat.deleteMany({
        where: { userId: request.requesterId, threadId: request.threadId },
      });
      await tx.userHiddenChat.updateMany({
        where: { userId: request.recipientId, threadId: request.threadId },
        data: { hideForAll: false },
      });
      await tx.userNotification.updateMany({
        where: { userId, type: "chat_hide_request", hiddenAt: null, metadata: { path: "$.requestId", equals: request.id } },
        data: { hiddenAt: now },
      });
      return tx.chatMessage.findFirst({
        where: { threadId: request.threadId, replyToId: request.id },
        select: { id: true, senderId: true, sentAt: true },
      });
    });
    if (message) {
      const payload = {
        id: message.id,
        chatId: request.threadId,
        senderId: message.senderId,
        type: "system",
        textMsg: "CHAT_HIDE_REQUEST:EXPIRED",
        replyToId: request.id,
        isRead: false,
        deliveredAt: null,
        sentAt: message.sentAt.toISOString(),
      };
      for (const recipientId of [request.requesterId, request.recipientId]) {
        emitChatRealtimeToUser(recipientId, {
          channel: "chat",
          type: "message_updated",
          otherUserId: recipientId === request.requesterId ? request.recipientId : request.requesterId,
          data: payload,
        });
      }
    }
  }
}

export async function cancelPendingHideRequest(
  requesterId: string,
  threadId: string,
  messageStatus: "EXPIRED" | "WITHDRAWN" = "EXPIRED",
) {
  const requests = await prisma.chatHideRequest.findMany({
    where: {
      requesterId,
      threadId,
      action: ChatHideRequestAction.HIDE_FOR_ALL,
      status: ChatHideRequestStatus.PENDING,
    },
    select: { id: true, recipientId: true },
  });
  if (!requests.length) return false;
  const now = new Date();
  const messages = await prisma.$transaction(async (tx) => {
    const messages: Array<{ requestId: string; recipientId: string; message: { id: string; senderId: string; sentAt: Date } | null }> = [];
    for (const request of requests) {
      const changed = await tx.chatHideRequest.updateMany({
        where: { id: request.id, status: ChatHideRequestStatus.PENDING },
        data: { status: ChatHideRequestStatus.EXPIRED, respondedAt: now },
      });
      if (!changed.count) continue;
      if (messageStatus === "WITHDRAWN") {
        await tx.userHiddenChat.deleteMany({ where: { userId: requesterId, threadId } });
      }
      await tx.chatMessage.updateMany({
        where: { threadId, replyToId: request.id, text: "CHAT_HIDE_REQUEST:PENDING" },
        data: { text: `CHAT_HIDE_REQUEST:${messageStatus}` },
      });
      const message = await tx.chatMessage.findFirst({
        where: { threadId, replyToId: request.id },
        select: { id: true, senderId: true, sentAt: true },
      });
      await tx.userNotification.updateMany({
        where: {
          userId: request.recipientId,
          type: "chat_hide_request",
          hiddenAt: null,
          metadata: { path: "$.requestId", equals: request.id },
        },
        data: { hiddenAt: now },
      });
      messages.push({ requestId: request.id, recipientId: request.recipientId, message });
    }
    return messages;
  });
  for (const { requestId, recipientId, message } of messages) {
    if (message) {
      const payload = {
        id: message.id,
        chatId: threadId,
        senderId: message.senderId,
        type: "system",
        textMsg: `CHAT_HIDE_REQUEST:${messageStatus}`,
        replyToId: requestId,
        isRead: false,
        deliveredAt: null,
        sentAt: message.sentAt.toISOString(),
      };
      for (const userId of [requesterId, recipientId]) {
        emitChatRealtimeToUser(userId, {
          channel: "chat",
          type: "message_updated",
          otherUserId: userId === requesterId ? recipientId : requesterId,
          data: payload,
        });
      }
    }
    for (const userId of [requesterId, recipientId]) {
      emitChatRealtimeToUser(userId, {
        channel: "chat",
        type: "chat_privacy_updated",
        otherUserId: userId === requesterId ? recipientId : requesterId,
      });
    }
  }
  return messages.length > 0;
}

export async function expireAllPendingHideRequests() {
  const due = await prisma.chatHideRequest.findMany({
    where: {
      status: ChatHideRequestStatus.PENDING,
      OR: [
        { action: ChatHideRequestAction.HIDE_FOR_ALL, expiresAt: { lte: new Date() } },
        { action: ChatHideRequestAction.UNHIDE_FOR_ALL, createdAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
    },
    select: { requesterId: true, recipientId: true },
  });
  const userIds = new Set(due.flatMap((request) => [request.requesterId, request.recipientId]));
  for (const userId of userIds) {
    await expirePendingHideRequests(userId);
    await expireUnansweredUnhideRequests(userId);
  }
  return { expiredRequests: due.length };
}

async function hideRelatedActivity(tx: Prisma.TransactionClient, userId: string, otherUserId: string) {
  const [tips, bookings, ledger] = await Promise.all([
    tx.tip.findMany({
      where: { OR: [{ senderId: userId, receiverId: otherUserId }, { senderId: otherUserId, receiverId: userId }] },
      select: { id: true },
    }),
    tx.callBooking.findMany({
      where: { OR: [{ customerId: userId, creatorId: otherUserId }, { customerId: otherUserId, creatorId: userId }] },
      select: { id: true },
    }),
    tx.creditLedger.findMany({
      where: {
        OR: [
          { userId, counterpartyId: otherUserId },
          { userId: otherUserId, counterpartyId: userId },
        ],
        idempotencyKey: { startsWith: "consume:" },
      },
      select: { idempotencyKey: true },
    }),
  ]);
  const tipIds = tips.map((row) => row.id);
  const bookingIds = bookings.map((row) => row.id);
  const creditIds = ledger.map((row) => (row.idempotencyKey ?? "").replace(/^consume:/, ""));
  const now = new Date();
  await Promise.all([
    tipIds.length ? tx.earningLot.updateMany({ where: { userId, source: "TIP", sourceId: { in: tipIds }, hiddenAt: null }, data: { hiddenAt: now } }) : Promise.resolve(),
    bookingIds.length ? tx.earningLot.updateMany({ where: { userId, source: { in: ["VOICE_SESSION", "VIDEO_SESSION"] }, sourceId: { in: bookingIds }, hiddenAt: null }, data: { hiddenAt: now } }) : Promise.resolve(),
    creditIds.length ? tx.earningLot.updateMany({ where: { userId, source: { in: ["KEY", "CHAT_CREDIT"] }, sourceId: { in: creditIds }, hiddenAt: null }, data: { hiddenAt: now } }) : Promise.resolve(),
  ]);
}

function hashCode(userId: string, purpose: PrivateCodePurpose, code: string) {
  if (!/^\d{4}$/.test(code)) {
    throw new ChatPrivacyError("Enter a valid 4-digit code.");
  }
  return createHmac("sha256", env.JWT_SECRET)
    .update(`${userId}:${purpose}:${code}`)
    .digest("hex");
}

// Reissue the private broadcast once on the next private save for accounts
// enrolled before this rollout. Preserve their recovery token and private data.
const recoveryDeliveryResetAt = new Date("2026-11-24T09:00:58.000Z");

async function getOrCreateCodeGroup(
  tx: Prisma.TransactionClient,
  userId: string,
  purpose: PrivateCodePurpose,
  code: string,
  issueRecovery = false,
) {
  const codeHash = hashCode(userId, purpose, code);
  const encryptedRecoveryPin = await encryptVaultSecret(code);
  const recovery = await tx.privateCodeRecovery.findUnique({
    where: { userId },
    select: { userId: true, issuedAt: true },
  });
  const recoveryEnabled = false;
  if (recoveryEnabled && issueRecovery && (!recovery || recovery.issuedAt < recoveryDeliveryResetAt)) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const tokenBytes = randomBytes(7);
    const token = Array.from(tokenBytes).map(b => chars[b % chars.length]).join("");
    await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true } });
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const broadcastUser = await tx.user.findUnique({
      where: { externalId: "system:chatandtip" },
      select: { id: true },
    });
    if (broadcastUser) {
      const participant = await tx.chatParticipant.findFirst({
      where: { userId, otherUserId: broadcastUser.id, thread: { kind: "BROADCAST" } },
      });
      const thread = participant ?? await tx.chatThread.create({
        data: {
          kind: "BROADCAST",
          broadcastOnly: true,
          initiatorId: broadcastUser.id,
          lastMessageText: "ChatAndTip",
          lastMessageAt: new Date(),
          participants: {
            create: [
              { userId, otherUserId: broadcastUser.id },
              { userId: broadcastUser.id, otherUserId: userId },
            ],
          },
        },
      });
      const enrolled = await tx.privateCodeRecovery.findUnique({ where: { userId } });
      if (!enrolled || enrolled.issuedAt < recoveryDeliveryResetAt) {
        await tx.chatMessage.create({
          data: {
            threadId: "threadId" in thread ? thread.threadId : thread.id,
            senderId: broadcastUser.id,
            type: "SYSTEM",
            text: "Open this broadcast for account messages.",
          },
        });
      }
    }
    await tx.privateCodeRecovery.upsert({
      where: { userId },
      create: { userId, encryptedToken: await encryptVaultSecret(token) },
      update: {},
    });
    await tx.privateCodeRecovery.updateMany({
      where: { userId, issuedAt: { lt: recoveryDeliveryResetAt } },
      data: { issuedAt: new Date() },
    });
  }
  return tx.chatPrivateCodeGroup.upsert({
    where: {
      userId_purpose_codeHash: { userId, purpose, codeHash },
    },
    create: { userId, purpose, codeHash, encryptedRecoveryPin },
    update: { encryptedRecoveryPin },
    select: { id: true },
  });
}

async function getIndividualThread(userId: string, otherUserId: string, allowEntityPeer = false) {
  if (userId === otherUserId) throw new ChatPrivacyError("Invalid conversation.");
  const [me, other, participant] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { accountType: true } }),
    prisma.user.findUnique({ where: { id: otherUserId }, select: { accountType: true } }),
    prisma.chatParticipant.findFirst({
      where: { userId, otherUserId },
      select: { threadId: true },
    }),
  ]);
  if (me?.accountType !== AccountType.INDIVIDUAL ||
      (other?.accountType !== AccountType.INDIVIDUAL &&
       !(allowEntityPeer && other?.accountType === AccountType.ENTITY))) {
    throw new ChatPrivacyError("Hide Chat is available between individual accounts only.", 403);
  }
  if (!participant) throw new ChatPrivacyError("Conversation not found.", 404);
  const thread = await prisma.chatThread.findUnique({
    where: { id: participant.threadId },
    select: { id: true, kind: true, broadcastOnly: true },
  });
  if (!thread || (thread.kind !== ChatThreadKind.DIRECT && !(thread.kind === ChatThreadKind.SELF && userId === otherUserId)) || thread.broadcastOnly) {
    throw new ChatPrivacyError("This conversation cannot be hidden.", 400);
  }
  return thread.id;
}

async function getDirectThread(userId: string, otherUserId: string) {
  const participant = await prisma.chatParticipant.findFirst({
    where: { userId, otherUserId },
    select: { threadId: true },
  });
  if (!participant) throw new ChatPrivacyError("Conversation not found.", 404);
  const thread = await prisma.chatThread.findUnique({
    where: { id: participant.threadId },
    select: { id: true, kind: true, broadcastOnly: true },
  });
  const isOwnSelfChat =
    thread?.kind === ChatThreadKind.SELF && userId === otherUserId;
  if (
    !thread ||
    (thread.kind !== ChatThreadKind.DIRECT && !isOwnSelfChat) ||
    thread.broadcastOnly
  ) {
    throw new ChatPrivacyError("Messages from this conversation cannot be moved.");
  }
  return thread.id;
}

export async function hideChatForMe(
  userId: string,
  otherUserId: string,
  code: string,
) {
  const threadId = await getIndividualThread(userId, otherUserId, true);
  const result = await prisma.$transaction(async (tx) => {
    const shared = await tx.userHiddenChat.findFirst({ where: { threadId, hideForAll: true } });
    if (shared) throw new ChatPrivacyError("Both people must agree to unhide this chat before changing its privacy.", 409);
    const group = await getOrCreateCodeGroup(tx, userId, PrivateCodePurpose.HIDDEN_CHATS, code);
    await tx.userHiddenChat.upsert({
      where: { userId_threadId: { userId, threadId } },
      create: { userId, threadId, codeGroupId: group.id },
      update: { codeGroupId: group.id, hideForAll: false, hiddenAt: new Date() },
    });
    await tx.userNotification.updateMany({
      where: { userId, senderId: otherUserId, hiddenAt: null },
      data: { hiddenAt: new Date() },
    });
    await hideRelatedActivity(tx, userId, otherUserId);
    return { hidden: true, threadId };
  });
}

export async function requestHideForAll(
  userId: string,
  otherUserId: string,
  code: string,
) {
  const threadId = await getIndividualThread(userId, otherUserId);
  const result = await prisma.$transaction(async (tx) => {
    const shared = await tx.userHiddenChat.findFirst({ where: { threadId, hideForAll: true } });
    if (shared) throw new ChatPrivacyError("This chat is already hidden for both people.", 409);
    const group = await getOrCreateCodeGroup(tx, userId, PrivateCodePurpose.HIDDEN_CHATS, code);
    await tx.userHiddenChat.upsert({
      where: { userId_threadId: { userId, threadId } },
      create: { userId, threadId, codeGroupId: group.id },
      update: { codeGroupId: group.id, hideForAll: false, hiddenAt: new Date() },
    });
    await tx.userNotification.updateMany({
      where: { userId, senderId: otherUserId, hiddenAt: null },
      data: { hiddenAt: new Date() },
    });
    await hideRelatedActivity(tx, userId, otherUserId);
    const pending = await tx.chatHideRequest.findFirst({
      where: {
        threadId,
        requesterId: userId,
        recipientId: otherUserId,
        action: ChatHideRequestAction.HIDE_FOR_ALL,
        status: ChatHideRequestStatus.PENDING,
      },
      select: { id: true, expiresAt: true },
    });
    const request = pending ?? await tx.chatHideRequest.create({
      data: {
        threadId,
        requesterId: userId,
        recipientId: otherUserId,
        action: ChatHideRequestAction.HIDE_FOR_ALL,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    if (pending && !pending.expiresAt) {
      await tx.chatHideRequest.update({
        where: { id: pending.id },
        data: { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      });
    }
    const sentAt = new Date();
    let message = await tx.chatMessage.findFirst({ where: { threadId, replyToId: request.id } });
    const createdMessage = !message;
    if (!message) {
      message = await tx.chatMessage.create({
        data: { threadId, senderId: userId, type: ChatMessageType.SYSTEM, text: "CHAT_HIDE_REQUEST:PENDING", replyToId: request.id, sentAt },
      });
      await tx.chatParticipant.updateMany({
        where: { threadId, userId: otherUserId },
        data: { unreadCount: { increment: 1 }, archived: false },
      });
    }
    return { hidden: true, requestId: request.id, threadId, createdMessage, shouldNotify: !pending && createdMessage, message: {
      id: message.id, chatId: threadId, senderId: userId, type: "system",
      textMsg: message.text, replyToId: request.id, isRead: false,
      deliveredAt: null, sentAt: message.sentAt.toISOString(),
    } };
  });
  if (result.message && result.createdMessage) {
    for (const recipientId of [userId, otherUserId]) {
      emitChatRealtimeToUser(recipientId, {
        channel: "chat", type: "message_created",
        otherUserId: recipientId === userId ? otherUserId : userId,
        data: result.message,
      });
    }
  }
  // Privacy requests stay in the conversation, never in device notifications.
  return result;
}

export async function respondToHideRequest(
  recipientId: string,
  requestId: string,
  accept: boolean,
  code?: string,
) {
  const request = await prisma.chatHideRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.recipientId !== recipientId) {
    throw new ChatPrivacyError("Request not found.", 404);
  }
  if (request.status !== ChatHideRequestStatus.PENDING) {
    throw new ChatPrivacyError("This request has already been handled.", 409);
  }
  if (request.action === ChatHideRequestAction.HIDE_FOR_ALL && request.expiresAt && request.expiresAt <= new Date()) {
    await expirePendingHideRequests(recipientId);
    throw new ChatPrivacyError("This request has expired.", 409);
  }
  if (request.action === ChatHideRequestAction.UNHIDE_FOR_ALL && request.expiresAt && request.expiresAt <= new Date()) {
    await expireUnansweredUnhideRequests(recipientId);
    throw new ChatPrivacyError("This request has expired.", 409);
  }
  if (accept && request.action === ChatHideRequestAction.HIDE_FOR_ALL && !/^\d{4}$/.test(code ?? "")) {
    throw new ChatPrivacyError("Enter and confirm a valid 4-digit code.");
  }
  if (accept && request.action === ChatHideRequestAction.HIDE_FOR_ALL) {
    const requesterStillHidden = await prisma.userHiddenChat.findUnique({
      where: {
        userId_threadId: {
          userId: request.requesterId,
          threadId: request.threadId,
        },
      },
      select: { id: true },
    });
    if (!requesterStillHidden) {
      await cancelPendingHideRequest(request.requesterId, request.threadId);
      throw new ChatPrivacyError("This request has expired.", 409);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const changed = await tx.chatHideRequest.updateMany({
      where: { id: request.id, status: ChatHideRequestStatus.PENDING },
      data: {
        status: accept ? ChatHideRequestStatus.ACCEPTED : ChatHideRequestStatus.DECLINED,
        respondedAt: now,
      },
    });
    if (!changed.count) {
      throw new ChatPrivacyError("This request has expired or been withdrawn.", 409);
    }
    const requestMessage = await tx.chatMessage.findFirst({
      where: { threadId: request.threadId, replyToId: request.id },
      select: { id: true, senderId: true, type: true, sentAt: true },
    });
    const requestText = `CHAT_${request.action === ChatHideRequestAction.UNHIDE_FOR_ALL ? "UNHIDE" : "HIDE"}_REQUEST:${accept ? "ACCEPTED" : "DECLINED"}`;
    if (requestMessage) {
      await tx.chatMessage.update({ where: { id: requestMessage.id }, data: { text: requestText } });
    }

    if (request.action === ChatHideRequestAction.HIDE_FOR_ALL) {
      if (accept) {
        const group = await getOrCreateCodeGroup(tx, recipientId, PrivateCodePurpose.HIDDEN_CHATS, code!);
        await tx.userHiddenChat.upsert({
          where: { userId_threadId: { userId: recipientId, threadId: request.threadId } },
          create: { userId: recipientId, threadId: request.threadId, codeGroupId: group.id, hideForAll: true },
          update: { codeGroupId: group.id, hideForAll: true, hiddenAt: now },
        });
        await tx.userNotification.updateMany({
          where: { userId: recipientId, senderId: request.requesterId, hiddenAt: null },
          data: { hiddenAt: now },
        });
        await hideRelatedActivity(tx, recipientId, request.requesterId);
        await tx.userHiddenChat.updateMany({
          where: { userId: request.requesterId, threadId: request.threadId },
          data: { hideForAll: true },
        });
      }
    } else if (accept) {
      await tx.userHiddenChat.deleteMany({ where: { threadId: request.threadId } });
    }

    return {
      accepted: accept,
      action: request.action,
      threadId: request.threadId,
      message: requestMessage ? {
        id: requestMessage.id,
        chatId: request.threadId,
        senderId: requestMessage.senderId,
        type: "system",
        textMsg: requestText,
        replyToId: request.id,
        isRead: true,
        deliveredAt: null,
        sentAt: requestMessage.sentAt.toISOString(),
      } : null,
    };
  });
  if (result.message) {
    for (const userId of [request.requesterId, recipientId]) {
      emitChatRealtimeToUser(userId, {
        channel: "chat",
        type: "message_updated",
        otherUserId: userId === request.requesterId ? recipientId : request.requesterId,
        data: result.message,
      });
    }
  }
  return { accepted: result.accepted, action: result.action, threadId: result.threadId };
}

export async function requestUnhideForAll(userId: string, otherUserId: string) {
  const threadId = await getIndividualThread(userId, otherUserId);
  const bothHidden = await prisma.userHiddenChat.count({
    where: { threadId, hideForAll: true },
  });
  if (bothHidden < 2) throw new ChatPrivacyError("This chat is hidden only for you.", 409);

  const existing = await prisma.chatHideRequest.findFirst({
    where: {
      threadId,
      requesterId: userId,
      action: ChatHideRequestAction.UNHIDE_FOR_ALL,
      status: ChatHideRequestStatus.PENDING,
    },
  });
  if (existing) return { requestId: existing.id, pending: true };

  const request = await prisma.chatHideRequest.create({
    data: {
      threadId,
      requesterId: userId,
      recipientId: otherUserId,
      action: ChatHideRequestAction.UNHIDE_FOR_ALL,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  });
  return { requestId: request.id, pending: true };
}

export async function recoverHiddenChat(userId: string, username: string) {
  const own = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, username: true } });
  const query = username.trim();
  const isOwnName = own && [own.fullName, own.username].some((value) => value?.toLowerCase() === query.toLowerCase());
  const other = isOwnName ? own : await prisma.user.findFirst({
    where: { username: { equals: username.trim() } },
    select: { id: true },
  });
  if (!other) return { cleared: false };
  const participant = await prisma.chatParticipant.findFirst({
    where: { userId, otherUserId: other.id },
    select: { threadId: true },
  });
  if (!participant) return { cleared: false };
  const hidden = await prisma.userHiddenChat.findUnique({
    where: { userId_threadId: { userId, threadId: participant.threadId } },
  });
  if (!hidden) return { cleared: false };
  if (hidden.hideForAll) throw new ChatPrivacyError("Both people must agree to unhide this chat.", 409);
  await prisma.$transaction(async (tx) => {
    const clearedAt = new Date();
    await tx.chatParticipant.updateMany({
      where: { userId, threadId: participant.threadId },
      data: { clearedAt, unreadCount: 0 },
    });
    await tx.userHiddenChat.deleteMany({
      where: { userId, threadId: participant.threadId },
    });
  });
  return { cleared: true, unhidden: true };
}

export async function listHiddenChats(userId: string, code: string) {
  await expireUnansweredUnhideRequests(userId);
  await expirePendingHideRequests(userId);
  const codeHash = hashCode(userId, PrivateCodePurpose.HIDDEN_CHATS, code);
  const group = await prisma.chatPrivateCodeGroup.findUnique({
    where: { userId_purpose_codeHash: { userId, purpose: PrivateCodePurpose.HIDDEN_CHATS, codeHash } },
    select: { id: true },
  });
  if (!group) return [];
  return prisma.userHiddenChat.findMany({
    where: { userId, codeGroupId: group.id },
    include: {
      thread: {
        include: {
          participants: {
            include: { user: { include: { media: true } } },
          },
          messages: { orderBy: { sentAt: "desc" }, take: 50 },
        },
      },
    },
    orderBy: { hiddenAt: "desc" },
  });
}

export async function moveMessagesToSecureFolder(input: {
  userId: string;
  otherUserId: string;
  messageIds: string[];
  code: string;
  confirmCode: string;
  folderId?: string;
}) {
  if (input.code !== input.confirmCode) throw new ChatPrivacyError("The codes do not match.");
  if (!input.messageIds.length || input.messageIds.length > 100) {
    throw new ChatPrivacyError("Select between 1 and 100 messages.");
  }
  const threadId = await getDirectThread(input.userId, input.otherUserId);
  const messages = await prisma.chatMessage.findMany({
    where: { id: { in: input.messageIds }, threadId },
    select: { id: true },
  });
  if (messages.length !== new Set(input.messageIds).size) {
    throw new ChatPrivacyError("One or more messages could not be found.", 404);
  }

  return prisma.$transaction(async (tx) => {
    const group = await getOrCreateCodeGroup(tx, input.userId, PrivateCodePurpose.SECURE_FOLDER, input.code);
    if (input.folderId) {
      const destination = await tx.vaultFolder.findFirst({ where: { id: input.folderId, codeGroupId: group.id } });
      if (!destination) throw new ChatPrivacyError("Folder not found in this vault.", 404);
    }
    const existing = await tx.secureFolderMessage.findMany({ where: { ownerId: input.userId, messageId: { in: input.messageIds } }, select: { codeGroupId: true } });
    if (existing.some(row => row.codeGroupId !== group.id)) throw new ChatPrivacyError("One or more items are unavailable in this vault.", 404);
    await tx.secureFolderMessage.createMany({
      data: messages.map(({ id }) => ({
        ownerId: input.userId,
        messageId: id,
        codeGroupId: group.id,
        folderId: input.folderId || null,
      })),
      skipDuplicates: true,
    });
    const remaining = await tx.chatMessage.findFirst({
      where: {
        threadId,
        type: { not: "SYSTEM" },
        secureCopies: { none: { ownerId: input.userId } },
        OR: [
          { deletedForUserIds: { equals: Prisma.DbNull } },
          { NOT: { deletedForUserIds: { array_contains: [input.userId] } } },
        ],
      },
      select: { id: true },
    });
    if (!remaining) {
      await tx.chatParticipant.updateMany({
        where: { threadId, userId: input.userId },
        data: { clearedAt: new Date(), unreadCount: 0 },
      });
    }
    return { moved: messages.length };
  });
}

export async function listSecureFolderMessages(userId: string, code: string) {
  const codeHash = hashCode(userId, PrivateCodePurpose.SECURE_FOLDER, code);
  const group = await prisma.chatPrivateCodeGroup.findUnique({
    where: { userId_purpose_codeHash: { userId, purpose: PrivateCodePurpose.SECURE_FOLDER, codeHash } },
    select: { id: true },
  });
  if (!group) return [];
  const rows = await prisma.secureFolderMessage.findMany({
    where: { ownerId: userId, codeGroupId: group.id },
    include: {
      message: {
        include: {
          thread: {
            include: {
              participants: {
                include: { user: { include: { media: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { movedAt: "desc" },
  });
  return Promise.all(rows.map(async (row) => {
    const message = row.message;
    const peerParticipant =
      message.thread.participants.find(
        (participant) => participant.userId !== userId,
      ) ??
      (message.thread.kind === ChatThreadKind.SELF
        ? message.thread.participants.find(
            (participant) => participant.userId === userId,
          )
        : undefined);
    const peer = peerParticipant?.user;
    return {
      id: row.id,
      movedAt: row.movedAt,
      folderId: row.folderId,
      displayName: row.displayName,
      vaultDirectUpload:
        message.thread.kind === ChatThreadKind.SELF &&
        (message.text === "__CHATANDTIP_VAULT_DIRECT_UPLOAD__" ||
          (!message.text && Boolean(message.imageObjectKey || message.videoObjectKey || message.documentObjectKey))),
      message: {
        id: message.id,
        albumId: message.albumId,
        senderId: message.senderId,
        type: message.type,
        text: message.text,
        sentAt: message.sentAt,
        documentName: row.displayName ?? message.documentName,
        documentMimeType: message.documentMimeType,
        documentSizeBytes: message.documentSizeBytes,
        imageUrl: message.imageObjectKey
          ? await getSignedPrivateR2DownloadUrl(message.imageObjectKey, 3600, true)
          : message.imageUrl,
        videoUrl: message.videoObjectKey
          ? await getSignedPrivateR2DownloadUrl(message.videoObjectKey, 3600, true)
          : message.videoUrl,
        thumbnailUrl: message.thumbnailObjectKey
          ? await getSignedPrivateR2DownloadUrl(message.thumbnailObjectKey, 3600, true)
          : message.thumbnailUrl,
        documentUrl: message.documentObjectKey
          ? await getSignedPrivateR2DownloadUrl(message.documentObjectKey, 3600, true)
          : null,
      },
      // Keep the canonical userId and the legacy Vault id alias in sync.
      peer: peer ? { ...serializeMobileUser(peer as never), id: peer.id } : null,
    };
  }));
}

export async function secureFolderCodeExists(userId: string, code: string) {
  const codeHash = hashCode(userId, PrivateCodePurpose.SECURE_FOLDER, code);
  return Boolean(await prisma.chatPrivateCodeGroup.findUnique({
    where: {
      userId_purpose_codeHash: {
        userId,
        purpose: PrivateCodePurpose.SECURE_FOLDER,
        codeHash,
      },
    },
    select: { id: true },
  }));
}

export async function changeHiddenChatCode(userId: string, currentCode: string, nextCode: string, otherUserId?: string) {
  if (typeof currentCode !== "string" || typeof nextCode !== "string" ||
      !/^\d{4}$/.test(currentCode) || !/^\d{4}$/.test(nextCode)) {
    throw new ChatPrivacyError("Codes must contain exactly 4 digits.", 400);
  }
  const purpose = PrivateCodePurpose.HIDDEN_CHATS;
  const currentHash = hashCode(userId, purpose, currentCode);
  return prisma.$transaction(async (tx) => {
    const current = await tx.chatPrivateCodeGroup.findUnique({
      where: { userId_purpose_codeHash: { userId, purpose, codeHash: currentHash } },
      select: { id: true },
    });
    if (!current) throw new ChatPrivacyError("Current hidden chat code is incorrect.", 400);
    if (currentCode === nextCode) throw new ChatPrivacyError("Choose a different code.", 400);
    const next = await getOrCreateCodeGroup(tx, userId, purpose, nextCode);
    await tx.userHiddenChat.updateMany({
      where: {
        userId,
        codeGroupId: current.id,
        ...(otherUserId ? { thread: { participants: { some: { userId: otherUserId } } } } : {}),
      },
      data: { codeGroupId: next.id },
    });
    // Both relations cascade on deletion; retain any still-shared group.
    await tx.chatPrivateCodeGroup.deleteMany({
      where: {
        id: current.id,
        userId,
        purpose,
        hiddenChats: { none: {} },
        messages: { none: {} },
      },
    });
    return { changed: true };
  });
}

export async function changeSecureFolderCode(userId: string, currentCode: string, nextCode: string, peerUserId?: string, messageId?: string) {
  if (!/^\d{4}$/.test(currentCode) || !/^\d{4}$/.test(nextCode)) {
    throw new ChatPrivacyError("Codes must contain exactly 4 digits.", 400);
  }
  const currentHash = hashCode(userId, PrivateCodePurpose.SECURE_FOLDER, currentCode);
  const current = await prisma.chatPrivateCodeGroup.findUnique({
    where: { userId_purpose_codeHash: { userId, purpose: PrivateCodePurpose.SECURE_FOLDER, codeHash: currentHash } },
  });
  if (!current) throw new ChatPrivacyError("Current Vault code is incorrect.", 400);
  if (currentCode === nextCode) throw new ChatPrivacyError("Choose a different code.", 400);
  await prisma.$transaction(async (tx) => {
    // Preserve the complete folder tree when changing an entire vault to a new code.
    const nextHash = hashCode(userId, PrivateCodePurpose.SECURE_FOLDER, nextCode);
    const target = await tx.chatPrivateCodeGroup.findUnique({ where: { userId_purpose_codeHash: { userId, purpose: PrivateCodePurpose.SECURE_FOLDER, codeHash: nextHash } } });
    if (!peerUserId && !messageId && !target) {
      await tx.chatPrivateCodeGroup.update({ where: { id: current.id }, data: { codeHash: nextHash, encryptedRecoveryPin: await encryptVaultSecret(nextCode) } });
      return;
    }
    const next = await getOrCreateCodeGroup(tx, userId, PrivateCodePurpose.SECURE_FOLDER, nextCode);
    await tx.secureFolderMessage.updateMany({
      where: {
        ownerId: userId,
        codeGroupId: current.id,
        ...(messageId
          ? { messageId }
          : peerUserId
            ? { message: { thread: { participants: { some: { userId: peerUserId } } } } }
            : {}),
      },
      data: { codeGroupId: next.id, folderId: null },
    });
    const remaining = await tx.secureFolderMessage.count({
      where: { ownerId: userId, codeGroupId: current.id },
    });
    if (remaining === 0) {
      await tx.chatPrivateCodeGroup.deleteMany({ where: { id: current.id } });
    }
  });
  return { changed: true };
}

export async function removeSecureFolderMessage(userId: string, messageId: string, code: string) {
  const codeHash = hashCode(userId, PrivateCodePurpose.SECURE_FOLDER, code);
  return prisma.$transaction(async (tx) => {
    const entry = await tx.secureFolderMessage.findFirst({
      where: { ownerId: userId, messageId, codeGroup: { userId, purpose: PrivateCodePurpose.SECURE_FOLDER, codeHash } },
      include: { message: { select: { threadId: true, imageObjectKey: true, videoObjectKey: true, documentObjectKey: true } } },
    });
    if (!entry) return { removed: false };
    await tx.secureFolderMessage.delete({ where: { id: entry.id } });
    const keys = [entry.message.imageObjectKey, entry.message.videoObjectKey, entry.message.documentObjectKey].filter((key): key is string => !!key);
    if (keys.length) await tx.vaultUploadLedger.deleteMany({where:{userId,objectKey:{in:keys}}});
    await tx.chatParticipant.updateMany({
      where: { userId, threadId: entry.message.threadId },
      data: { clearedAt: null, archived: false },
    });
    return { removed: true };
  });
}

export async function deleteSecureFolderMessage(userId: string, messageId: string, code: string) {
  const codeHash = hashCode(userId, PrivateCodePurpose.SECURE_FOLDER, code);
  return prisma.$transaction(async (tx) => {
    const entry = await tx.secureFolderMessage.findFirst({
      where: { ownerId: userId, messageId, codeGroup: { userId, purpose: PrivateCodePurpose.SECURE_FOLDER, codeHash } },
      include: { message: { select: { id: true, deletedForUserIds: true, imageObjectKey: true, videoObjectKey: true, documentObjectKey: true } } },
    });
    if (!entry) return { removed: false };

    const deletedFor = Array.isArray(entry.message.deletedForUserIds)
      ? (entry.message.deletedForUserIds as string[])
      : [];
    if (!deletedFor.includes(userId)) {
      await tx.chatMessage.update({
        where: { id: entry.message.id },
        data: { deletedForUserIds: [...deletedFor, userId] },
      });
    }
    await tx.secureFolderMessage.delete({ where: { id: entry.id } });
    const keys = [entry.message.imageObjectKey, entry.message.videoObjectKey, entry.message.documentObjectKey].filter((key): key is string => !!key);
    if (keys.length) await tx.vaultUploadLedger.deleteMany({where:{userId,objectKey:{in:keys}}});
    return { removed: true };
  });
}

export async function setChatMute(userId: string, otherUserId: string, muted: boolean) {
  const participant = await prisma.chatParticipant.findFirst({
    where: { userId, otherUserId },
    select: { threadId: true },
  });
  if (!participant) throw new ChatPrivacyError("Conversation not found.", 404);
  if (muted) {
    await prisma.chatMute.upsert({
      where: { userId_threadId: { userId, threadId: participant.threadId } },
      create: { userId, threadId: participant.threadId },
      update: { mutedAt: new Date() },
    });
  } else {
    await prisma.chatMute.deleteMany({ where: { userId, threadId: participant.threadId } });
  }
  return { muted };
}

export async function getChatMuteState(userId: string, otherUserId: string) {
  const participant = await prisma.chatParticipant.findFirst({
    where: { userId, otherUserId },
    select: { threadId: true, anonymous: true },
  });
  if (!participant) return { muted: false, isHidden: false, anonymous: false, peerAnonymous: false };
  const peer = await prisma.chatParticipant.findUnique({
    where: { threadId_userId: { threadId: participant.threadId, userId: otherUserId } },
    select: { anonymous: true },
  });
  const setting = await prisma.chatMute.findUnique({
    where: { userId_threadId: { userId, threadId: participant.threadId } },
    select: { id: true },
  });
  const hidden = await prisma.userHiddenChat.findUnique({
    where: { userId_threadId: { userId, threadId: participant.threadId } },
    select: { id: true },
  });
  return { muted: Boolean(setting), isHidden: Boolean(hidden), anonymous: participant.anonymous, peerAnonymous: peer?.anonymous ?? false };
}

export async function setChatAnonymous(userId: string, otherUserId: string, anonymous: boolean) {
  if (userId === otherUserId) throw new ChatPrivacyError("Anonymous chat is not available here.", 400);
  const users = await prisma.user.count({ where: { id: { in: [userId, otherUserId] }, accountType: "INDIVIDUAL", role: "USER", isActive: true } });
  if (users !== 2) throw new ChatPrivacyError("Anonymous chat is available between individual accounts.", 400);
  const { getOrCreateThread } = await import("@/lib/mobile-chats");
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const blocked = await tx.userBlock.findFirst({ where: { OR: [
      { blockerId: userId, blockedId: otherUserId },
      { blockerId: otherUserId, blockedId: userId },
    ] } });
    if (blocked) throw new ChatPrivacyError("Messaging is unavailable for this user.", 403);
    await getOrCreateThread(userId, otherUserId, tx);
    const participant = await tx.chatParticipant.findFirst({
      where: { userId, otherUserId, thread: { kind: "DIRECT", broadcastOnly: false } },
      select: { id: true },
    });
    if (!participant) throw new ChatPrivacyError("Conversation not found.", 404);
    await tx.chatParticipant.update({ where: { id: participant.id }, data: { anonymous } });
  });
  for (const [recipient, peer] of [[userId, otherUserId], [otherUserId, userId]]) {
    emitChatRealtimeToUser(recipient, { channel: "chat", type: "chat_privacy_updated", otherUserId: peer });
  }
  return { anonymous };
}

export async function pinChatMessage(
  userId: string,
  otherUserId: string,
  messageId: string,
  pinned: boolean,
) {
  const participant = await prisma.chatParticipant.findFirst({
    where: { userId, otherUserId },
    select: { threadId: true },
  });
  if (!participant) throw new ChatPrivacyError("Conversation not found.", 404);
  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, threadId: participant.threadId },
  });
  if (!message) throw new ChatPrivacyError("Message not found.", 404);
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.chatMessage.update({
      where: { id: messageId },
      data: pinned
        ? { pinnedAt: new Date(), pinnedById: userId }
        : { pinnedAt: null, pinnedById: null },
    });
    if (pinned) {
      const sentAt = new Date();
      const notice = await tx.chatMessage.create({
        data: {
          threadId: participant.threadId,
          senderId: userId,
          type: ChatMessageType.SYSTEM,
          text: `CHAT_MESSAGE_PINNED:${messageId}`,
          reactions: {},
          sentAt,
        },
      });
      await tx.chatThread.update({
        where: { id: participant.threadId },
        data: {
          lastMessageText: "Pinned a message",
          lastMessageType: ChatMessageType.SYSTEM,
          lastMessageAt: sentAt,
        },
      });
      await tx.chatParticipant.updateMany({
        where: { threadId: participant.threadId, userId: otherUserId },
        data: { unreadCount: { increment: 1 } },
      });
      return { message: changed, notice };
    }
    return { message: changed, notice: null };
  });
  const pinnedMessage = updated.message;
  const payload = {
    id: pinnedMessage.id,
    chatId: participant.threadId,
    senderId: pinnedMessage.senderId,
    type: pinnedMessage.type.toLowerCase(),
    textMsg: pinnedMessage.text,
    imageUrl: pinnedMessage.imageUrl,
    videoUrl: pinnedMessage.videoUrl,
    thumbnailUrl: pinnedMessage.thumbnailUrl,
    sentAt: pinnedMessage.sentAt.toISOString(),
    pinnedAt: pinnedMessage.pinnedAt?.toISOString() ?? null,
    pinnedById: pinnedMessage.pinnedById,
  };
  for (const recipientId of [userId, otherUserId]) {
    emitChatRealtimeToUser(recipientId, {
      channel: "chat",
      type: "message_updated",
      otherUserId: recipientId === userId ? otherUserId : userId,
      data: payload,
    });
  }
  if (updated.notice) {
    const notice = {
      id: updated.notice.id,
      chatId: participant.threadId,
      senderId: userId,
      type: "system",
      textMsg: `CHAT_MESSAGE_PINNED:${messageId}`,
      isRead: false,
      deliveredAt: null,
      sentAt: updated.notice.sentAt.toISOString(),
    };
    for (const recipientId of [userId, otherUserId]) {
      emitChatRealtimeToUser(recipientId, {
        channel: "chat",
        type: "message_created",
        otherUserId: recipientId === userId ? otherUserId : userId,
        data: notice,
      });
    }
  }
  return { pinned };
}

export function isPrivateMessageType(type: ChatMessageType) {
  return type !== ChatMessageType.SYSTEM;
}


// Folder identifiers are opaque references, never authorization. Every read and
// write is scoped to the authenticated owner AND the hash of the supplied code.
const vaultCategories = ["Images", "Videos", "Documents", "Audio", "Other"] as const;
function vaultCategory(message: { type: string; documentMimeType?: string | null }) {
  if (message.type === "IMAGE") return "Images";
  if (message.type === "VIDEO") return "Videos";
  if (message.type === "AUDIO" || message.documentMimeType?.startsWith("audio/")) return "Audio";
  if (message.type === "DOCUMENT") return "Documents";
  return "Other";
}
function cleanVaultName(value: unknown) {
  if (typeof value !== "string") throw new ChatPrivacyError("Enter a name.");
  const name = value.trim();
  if (!name || name === "." || name === ".." || name.length > 255 || /[/\\\x00-\x1f\x7f]/.test(name)) {
    throw new ChatPrivacyError("Use a name of 1–255 characters without slashes or control characters.");
  }
  return name;
}
async function ensureVaultFolders(tx: Prisma.TransactionClient, codeGroupId: string) {
  const folders = await tx.vaultFolder.findMany({ where: { codeGroupId } });
  let defaultRoot = folders.find(folder => folder.systemKey === "default");
  if (!defaultRoot) {
    defaultRoot = await tx.vaultFolder.create({
      data: { id: "vf_" + randomBytes(16).toString("hex"), codeGroupId, systemKey: "default", name: "Folder 1", parentId: null },
    });
    folders.push(defaultRoot);
  }
  // Preserve user renames of the default folder; only newly created roots start as Folder 1.
  const roots = folders.filter(folder => folder.parentId === null);
  for (const root of roots) {
    for (const category of vaultCategories) {
      let child = folders.find(folder => folder.parentId === root.id && folder.name.toLocaleLowerCase() === category.toLocaleLowerCase());
      if (!child) {
        const key = root.id === defaultRoot.id
          ? category
          : `c_${root.id.slice(-8)}_${category.toLowerCase().slice(0, 3)}`;
        child = await tx.vaultFolder.create({
          data: { id: "vf_" + randomBytes(16).toString("hex"), codeGroupId, parentId: root.id, systemKey: key, name: category },
        });
        folders.push(child);
      } else if (!child.systemKey) {
        const key = root.id === defaultRoot.id
          ? category
          : `c_${root.id.slice(-8)}_${category.toLowerCase().slice(0, 3)}`;
        child = await tx.vaultFolder.update({ where: { id: child.id }, data: { systemKey: key } });
        folders[folders.findIndex(folder => folder.id === child!.id)] = child;
      }
    }
  }
  // Chat messages stay in Saved conversations. Only direct Vault uploads use
  // the folder tree; do not assign hidden chat messages to media categories.
  return folders;
}
export type VaultFolderOperation = {
  code: string; action: "list" | "initialize" | "create" | "renameFolder" | "renameItem" | "moveItems";
  folderId?: string; parentId?: string | null; name?: string; itemIds?: string[];
};
export async function manageVaultFolders(userId: string, input: VaultFolderOperation) {
  const codeHash = hashCode(userId, PrivateCodePurpose.SECURE_FOLDER, input.code);
  return prisma.$transaction(async tx => {
    // Serializes defaults, name collision checks and folder writes for this owner.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    let group = await tx.chatPrivateCodeGroup.findUnique({ where: { userId_purpose_codeHash: { userId, purpose: PrivateCodePurpose.SECURE_FOLDER, codeHash } }, select: { id: true } });
    if (!group) {
      if (input.action !== "create" && input.action !== "initialize") throw new ChatPrivacyError("Vault not found.", 404);
      group = await getOrCreateCodeGroup(tx, userId, PrivateCodePurpose.SECURE_FOLDER, input.code, false);
    }
    const scope = { ownerId: userId, codeGroupId: group.id };
    const folders = await ensureVaultFolders(tx, group.id);
    const folder = (id?: string | null) => {
      const found = folders.find(f => f.id === id);
      if (!found) throw new ChatPrivacyError("Folder not found in this vault.", 404);
      return found;
    };
    if (input.action === "list" || input.action === "initialize") return { folders };
    if (input.action === "create" || input.action === "renameFolder") {
      const name = cleanVaultName(input.name);
      const current = input.action === "renameFolder" ? folder(input.folderId) : null;
      const parentId = current ? current.parentId : input.parentId || null;
      if (parentId) folder(parentId);
      if (folders.some(f => f.parentId === parentId && f.id !== current?.id && f.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new ChatPrivacyError("A folder with that name already exists here.", 409);
      const saved = current
        ? await tx.vaultFolder.update({ where: { id: current.id, codeGroupId: group.id }, data: { name } })
        : await tx.vaultFolder.create({ data: { codeGroupId: group.id, parentId, name } });
      if (!current && parentId === null) {
        await tx.vaultFolder.createMany({ data: vaultCategories.map(category => ({
          id: "vf_" + randomBytes(16).toString("hex"), codeGroupId: group.id,
          parentId: saved.id,
          systemKey: `c_${saved.id.slice(-8)}_${category.toLowerCase().slice(0, 3)}`,
          name: category,
        })) });
      }
      return { folder: saved };
    }
    const ids = [...new Set(input.itemIds ?? [])];
    if (!ids.length || ids.length > 100) throw new ChatPrivacyError("Select between 1 and 100 items.");
    const items = await tx.secureFolderMessage.findMany({ where: { ...scope, id: { in: ids } }, select: { id: true } });
    if (items.length !== ids.length) throw new ChatPrivacyError("One or more items are unavailable in this vault.", 404);
    if (input.action === "renameItem") {
      if (ids.length !== 1) throw new ChatPrivacyError("Rename one item at a time.");
      await tx.secureFolderMessage.updateMany({ where: { ...scope, id: ids[0] }, data: { displayName: cleanVaultName(input.name) } });
    } else if (input.action === "moveItems") {
      const destination = folder(input.folderId);
      await tx.secureFolderMessage.updateMany({ where: { ...scope, id: { in: ids } }, data: { folderId: destination.id } });
    } else throw new ChatPrivacyError("Unknown action.");
    return { updated: ids.length };
  }, { timeout: 60000 });
}

export async function saveVaultUpload(userId: string, input: { code: string; objectKey: string; name: string; folderId?: string; thumbnailKey?: string }) {
  hashCode(userId, PrivateCodePurpose.SECURE_FOLDER, input.code);
  const name = cleanVaultName(input.name);
  if (!input.objectKey.startsWith(`private/${userId}/vault/`) && !isWebVaultMedia(input.objectKey)) throw new ChatPrivacyError("Upload not available.", 404);
  if (input.thumbnailKey && !input.thumbnailKey.startsWith(`private/${userId}/`)) throw new ChatPrivacyError("Upload not available.", 404);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const asset = await tx.asset.findUnique({ where: { objectKey: input.objectKey } });
    const ledger = await tx.vaultUploadLedger.findFirst({ where: { userId, objectKey: input.objectKey, state: "COMMITTED" } });
    if (!asset || asset.visibility !== "private" || !ledger) throw new ChatPrivacyError("Confirm the upload before saving it.", 400);
    if (input.thumbnailKey && !await tx.asset.findFirst({ where: { objectKey: input.thumbnailKey, visibility: "private" } })) throw new ChatPrivacyError("Thumbnail not available.", 404);
    const group = await getOrCreateCodeGroup(tx, userId, PrivateCodePurpose.SECURE_FOLDER, input.code);
    const folders = await ensureVaultFolders(tx, group.id);
    const mime = asset.contentType ?? "application/octet-stream";
    const type = mime.startsWith("image/") ? ChatMessageType.IMAGE : mime.startsWith("video/") ? ChatMessageType.VIDEO : ChatMessageType.DOCUMENT;
    const destination = input.folderId ? folders.find(f => f.id === input.folderId) : folders.find(f => f.systemKey === vaultCategory({type, documentMimeType: mime}));
    if (!destination) throw new ChatPrivacyError("Folder not found in this vault.", 404);
    const existing = await tx.secureFolderMessage.findFirst({ where: { ownerId: userId, message: { OR: [{imageObjectKey: input.objectKey}, {videoObjectKey: input.objectKey}, {documentObjectKey: input.objectKey}] } } });
    if (existing) {
      if (existing.codeGroupId !== group.id) throw new ChatPrivacyError("Upload not available in this vault.", 404);
      return { messageId: existing.messageId, itemId: existing.id };
    }
    let thread = await tx.chatThread.findFirst({ where: { kind: ChatThreadKind.SELF, participants: { some: { userId, otherUserId: userId } } }, select: { id: true } });
    if (!thread) thread = await tx.chatThread.create({ data: { kind: ChatThreadKind.SELF, initiatorId: userId, participants: { create: { userId, otherUserId: userId, clearedAt: new Date() } } }, select: { id: true } });
    const message = await tx.chatMessage.create({ data: {
      threadId: thread.id, senderId: userId, type, text: "__CHATANDTIP_VAULT_DIRECT_UPLOAD__",
      documentName: name, documentMimeType: mime, documentSizeBytes: asset.sizeBytes,
      imageObjectKey: type === ChatMessageType.IMAGE ? input.objectKey : null,
      videoObjectKey: type === ChatMessageType.VIDEO ? input.objectKey : null,
      documentObjectKey: type === ChatMessageType.DOCUMENT ? input.objectKey : null,
      thumbnailObjectKey: input.thumbnailKey || null,
    } });
    const item = await tx.secureFolderMessage.create({ data: { ownerId: userId, codeGroupId: group.id, messageId: message.id, folderId: destination.id, displayName: name } });
    // No ordinary chat preview, unread counter, push or realtime message is emitted.
    return { messageId: message.id, itemId: item.id };
  }, { timeout: 60000 });
}
