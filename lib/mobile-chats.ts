import "server-only"

import { ChatMessageType, Prisma, UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { serializeMobileUser } from "@/lib/mobile-users"
import { emitChatRealtimeToUser } from "@/lib/realtime"
import { createUserNotification } from "@/lib/mobile-notifications"
import { consumeCredit, getCreditBalances } from "@/lib/mobile-credits"

type UserWithMedia = Prisma.UserGetPayload<{
  include: { media: true }
}>

type ChatParticipantWithThread = Prisma.ChatParticipantGetPayload<{
  include: {
    thread: {
      include: {
        messages: {
          orderBy: { sentAt: "desc" }
          take: 1
        }
      }
    }
  }
}>

function parseChatMessageType(type: ChatMessageType) {
  return type.toLowerCase()
}

function normalizeReactions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, string[]>
  }

  const entries = Object.entries(value as Record<string, unknown>).map(([emoji, users]) => [
    emoji,
    Array.isArray(users) ? users.map((userId) => String(userId)) : [],
  ])

  return Object.fromEntries(entries)
}

function serializeChatSummary(participant: ChatParticipantWithThread, receiver: UserWithMedia) {
  const lastMessage = participant.thread.messages[0]
  if (!lastMessage) return null

  return {
    chatUserId: receiver.id,
    senderId: lastMessage.senderId,
    msgType: parseChatMessageType(lastMessage.type),
    lastMsg: lastMessage.text || "",
    sentAt: lastMessage.sentAt.toISOString(),
    unread: participant.unreadCount,
    receiver: serializeMobileUser(receiver),
  }
}

function serializeChatMessage(message: {
  id: string
  threadId: string
  senderId: string
  type: ChatMessageType
  text: string | null
  imageUrl: string | null
  replyToId: string | null
  replyToText: string | null
  replyToSenderId: string | null
  replyToSenderName: string | null
  reactions: unknown
  isRead: boolean
  locked?: boolean
  sentAt: Date
}) {
  return {
    id: message.id,
    chatId: message.threadId,
    senderId: message.senderId,
    type: parseChatMessageType(message.type),
    textMsg: message.text || "",
    imageUrl: message.imageUrl || "",
    replyToId: message.replyToId || "",
    replyToText: message.replyToText || "",
    replyToSenderId: message.replyToSenderId || "",
    replyToSenderName: message.replyToSenderName || "",
    reactions: normalizeReactions(message.reactions),
    isRead: message.isRead,
    locked: message.locked ?? false,
    sentAt: message.sentAt.toISOString(),
  }
}

async function getChatUserOrThrow(userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      role: UserRole.USER,
    },
    include: { media: true },
  })

  if (!user) {
    throw new Error("User not found")
  }

  return user as UserWithMedia
}

async function ensureUsersCanChat(userId: string, otherUserId: string) {
  if (userId === otherUserId) {
    throw new Error("You cannot message yourself")
  }

  const [me, other, block] = await Promise.all([
    getChatUserOrThrow(userId),
    getChatUserOrThrow(otherUserId),
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherUserId },
          { blockerId: otherUserId, blockedId: userId },
        ],
      },
    }),
  ])

  if (block) {
    throw new Error("Messaging is unavailable for this user")
  }

  return { me, other }
}

async function getParticipant(userId: string, otherUserId: string) {
  return prisma.chatParticipant.findFirst({
    where: {
      userId,
      otherUserId,
    },
  })
}

async function getChatSummaryForUser(
  tx: Prisma.TransactionClient,
  userId: string,
  otherUserId: string,
) {
  const [participant, receiver] = await Promise.all([
    tx.chatParticipant.findFirst({
      where: {
        userId,
        otherUserId,
      },
      include: {
        thread: {
          include: {
            messages: {
              orderBy: { sentAt: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
    tx.user.findFirst({
      where: {
        id: otherUserId,
        role: UserRole.USER,
      },
      include: { media: true },
    }),
  ])

  if (!participant || !receiver) return null

  return serializeChatSummary(participant as ChatParticipantWithThread, receiver as UserWithMedia)
}

async function getOrCreateThread(userId: string, otherUserId: string, tx: Prisma.TransactionClient) {
  const existing = await tx.chatParticipant.findFirst({
    where: {
      userId,
      otherUserId,
    },
    select: {
      threadId: true,
    },
  })

  if (existing) {
    return existing.threadId
  }

  const created = await tx.chatThread.create({
    data: {
      // First sender is the initiator (the paying "user").
      initiatorId: userId,
      participants: {
        create: [
          { userId, otherUserId },
          { userId: otherUserId, otherUserId: userId },
        ],
      },
    },
    select: { id: true },
  })

  return created.id
}

export async function getChats(userId: string) {
  await getChatUserOrThrow(userId)

  const participants = (await prisma.chatParticipant.findMany({
    where: {
      userId,
    },
    include: {
      thread: {
        include: {
          messages: {
            orderBy: { sentAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: {
      thread: {
        lastMessageAt: "desc",
      },
    },
  })) as ChatParticipantWithThread[]

  const visibleParticipants = participants.filter((participant) => {
    if (!participant.thread.lastMessageAt) return false
    return !participant.archived
  })

  const otherUserIds = Array.from(
    new Set(visibleParticipants.map((participant) => participant.otherUserId).filter(Boolean) as string[]),
  )

  const users = otherUserIds.length
    ? ((await prisma.user.findMany({
        where: {
          id: { in: otherUserIds },
          role: UserRole.USER,
        },
        include: { media: true },
      })) as UserWithMedia[])
    : []

  const usersById = new Map(users.map((user) => [user.id, user]))

  return visibleParticipants
    .map((participant) => {
      const receiver = participant.otherUserId ? usersById.get(participant.otherUserId) : undefined

      if (!receiver) return null

      return serializeChatSummary(participant, receiver)
    })
    .filter(Boolean)
}

export async function getMessages(userId: string, otherUserId: string) {
  await ensureUsersCanChat(userId, otherUserId)

  const participant = await getParticipant(userId, otherUserId)
  if (!participant) return []

  const result = await prisma.$transaction(async (tx) => {
    await tx.chatParticipant.update({
      where: { id: participant.id },
      data: {
        unreadCount: 0,
        archived: false,
      },
    })

    await tx.chatMessage.updateMany({
      where: {
        threadId: participant.threadId,
        senderId: { not: userId },
        isRead: false,
      },
      data: {
        isRead: true,
      },
    })

    const messages = await tx.chatMessage.findMany({
      where: {
        threadId: participant.threadId,
      },
      orderBy: { sentAt: "desc" },
    })

    const chatSummary = await getChatSummaryForUser(tx, userId, otherUserId)

    return {
      messages: messages.map(serializeChatMessage),
      chatSummary,
      readAt: new Date().toISOString(),
    }
  })

  if (result.chatSummary) {
    emitChatRealtimeToUser(userId, {
      channel: "chat",
      type: "chat_updated",
      otherUserId,
      data: result.chatSummary,
    })
  }

  emitChatRealtimeToUser(otherUserId, {
    channel: "chat",
    type: "messages_read",
    otherUserId: userId,
    readAt: result.readAt,
  })

  return result.messages
}

export async function sendMessage(input: {
  senderId: string
  receiverId: string
  textMsg?: string
  imageUrl?: string
  replyToId?: string
  replyToText?: string
  replyToSenderId?: string
  replyToSenderName?: string
}) {
  const textMsg = input.textMsg?.trim() || ""
  const imageUrl = input.imageUrl?.trim() || ""

  if (!textMsg && !imageUrl) {
    throw new Error("Message content is required")
  }

  const { me, other } = await ensureUsersCanChat(input.senderId, input.receiverId)

  const result = await prisma.$transaction(async (tx) => {
    const threadId = await getOrCreateThread(input.senderId, input.receiverId, tx)
    const messageType = imageUrl ? ChatMessageType.IMAGE : ChatMessageType.TEXT

    // Credits gating: a reply from the non-initiator starts locked — the
    // thread initiator unlocks it with a Key (first) or ChatCredit (after).
    // The initiator's own messages are always free/unlocked.
    const thread = await tx.chatThread.findUnique({
      where: { id: threadId },
      select: { initiatorId: true },
    })
    const locked = thread?.initiatorId != null && thread.initiatorId !== input.senderId

    const message = await tx.chatMessage.create({
      data: {
        threadId,
        senderId: input.senderId,
        type: messageType,
        text: textMsg || null,
        imageUrl: imageUrl || null,
        replyToId: input.replyToId || null,
        replyToText: input.replyToText || null,
        replyToSenderId: input.replyToSenderId || null,
        replyToSenderName: input.replyToSenderName || null,
        reactions: {},
        locked,
      },
    })

    await tx.chatThread.update({
      where: { id: threadId },
      data: {
        lastMessageText: textMsg || null,
        lastMessageType: messageType,
        lastMessageAt: message.sentAt,
      },
    })

    await tx.chatParticipant.updateMany({
      where: {
        threadId,
        userId: input.senderId,
      },
      data: {
        archived: false,
      },
    })

    await tx.chatParticipant.updateMany({
      where: {
        threadId,
        userId: input.receiverId,
      },
      data: {
        archived: false,
        unreadCount: { increment: 1 },
      },
    })

    const [senderSummary, receiverSummary] = await Promise.all([
      getChatSummaryForUser(tx, input.senderId, input.receiverId),
      getChatSummaryForUser(tx, input.receiverId, input.senderId),
    ])

    const serializedMessage = serializeChatMessage(message)

    return {
      response: {
        ...serializedMessage,
        receiver: serializeMobileUser(other),
      },
      serializedMessage,
      senderSummary,
      receiverSummary,
    }
  })

  await createUserNotification({
    userId: input.receiverId,
    senderId: input.senderId,
    title: me.fullName,
    message: textMsg || "Sent you a photo",
    type: "message",
    metadata: {
      threadUserId: input.senderId,
      messageId: result.serializedMessage.id,
    },
  })

  emitChatRealtimeToUser(input.senderId, {
    channel: "chat",
    type: "message_created",
    otherUserId: input.receiverId,
    data: result.serializedMessage,
  })

  emitChatRealtimeToUser(input.receiverId, {
    channel: "chat",
    type: "message_created",
    otherUserId: input.senderId,
    data: result.serializedMessage,
  })

  if (result.senderSummary) {
    emitChatRealtimeToUser(input.senderId, {
      channel: "chat",
      type: "chat_updated",
      otherUserId: input.receiverId,
      data: result.senderSummary,
    })
  }

  if (result.receiverSummary) {
    emitChatRealtimeToUser(input.receiverId, {
      channel: "chat",
      type: "chat_updated",
      otherUserId: input.senderId,
      data: result.receiverSummary,
    })
  }

  return result.response
}

/**
 * Unlock a locked reply. Only the thread initiator (the paying user) may
 * unlock: the first unlock in a thread spends a Key, subsequent ones spend a
 * ChatCredit, and the value is credited to the reply's sender (the creator).
 * Throws InsufficientCreditsError ("You have insufficient Balance") when the
 * initiator has no matching credit.
 */
export async function unlockReply(input: { userId: string; messageId: string }) {
  const message = await prisma.chatMessage.findUnique({
    where: { id: input.messageId },
    include: {
      thread: { select: { id: true, initiatorId: true, icebreakerUnlocked: true } },
    },
  })
  if (!message) throw new Error("Message not found")
  if (!message.locked) return serializeChatMessage(message) // already unlocked

  if (message.thread.initiatorId !== input.userId) {
    throw new Error("Only the conversation initiator can unlock replies")
  }

  // First reply in the thread costs a Key; every reply after costs a ChatCredit.
  const kind = message.thread.icebreakerUnlocked ? "CHAT_CREDIT" : "KEY"

  // Charge the initiator and credit the creator (throws if insufficient).
  await consumeCredit({
    userId: input.userId,
    creatorId: message.senderId,
    kind,
    idempotencyKey: `unlock:${message.id}`,
    metadata: { threadId: message.thread.id, messageId: message.id },
  })

  // Unlock the message and, on the first unlock, flip the thread flag so the
  // next reply costs a ChatCredit.
  await prisma.$transaction([
    prisma.chatMessage.update({ where: { id: message.id }, data: { locked: false } }),
    ...(kind === "KEY"
      ? [prisma.chatThread.update({ where: { id: message.thread.id }, data: { icebreakerUnlocked: true } })]
      : []),
  ])

  const updated = await prisma.chatMessage.findUnique({ where: { id: message.id } })
  const serialized = serializeChatMessage(updated!)

  // Push the now-unlocked message to both parties in real time.
  emitChatRealtimeToUser(input.userId, {
    channel: "chat",
    type: "message_updated",
    otherUserId: message.senderId,
    data: serialized,
  })
  emitChatRealtimeToUser(message.senderId, {
    channel: "chat",
    type: "message_updated",
    otherUserId: input.userId,
    data: serialized,
  })

  return { message: serialized, balances: await getCreditBalances(input.userId) }
}

export async function reactToMessage(input: {
  userId: string
  otherUserId: string
  messageId: string
  emoji: string
}) {
  await ensureUsersCanChat(input.userId, input.otherUserId)

  const participant = await getParticipant(input.userId, input.otherUserId)
  if (!participant) {
    throw new Error("Chat not found")
  }

  const result = await prisma.$transaction(async (tx) => {
    const message = await tx.chatMessage.findFirst({
      where: {
        id: input.messageId,
        threadId: participant.threadId,
      },
    })

    if (!message) {
      throw new Error("Message not found")
    }

    const reactions = normalizeReactions(message.reactions)
    const users = [...(reactions[input.emoji] ?? [])]
    const existingIndex = users.indexOf(input.userId)

    if (existingIndex >= 0) {
      users.splice(existingIndex, 1)
      if (users.length) {
        reactions[input.emoji] = users
      } else {
        delete reactions[input.emoji]
      }
    } else {
      reactions[input.emoji] = [...users, input.userId]
    }

    const updated = await tx.chatMessage.update({
      where: { id: message.id },
      data: {
        reactions: reactions as Prisma.InputJsonValue,
      },
    })

    return serializeChatMessage(updated)
  })

  emitChatRealtimeToUser(input.userId, {
    channel: "chat",
    type: "message_updated",
    otherUserId: input.otherUserId,
    data: result,
  })
  emitChatRealtimeToUser(input.otherUserId, {
    channel: "chat",
    type: "message_updated",
    otherUserId: input.userId,
    data: result,
  })

  return result
}

export async function markChatViewed(userId: string, otherUserId: string) {
  const participant = await getParticipant(userId, otherUserId)
  if (!participant) {
    return { success: true }
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.chatParticipant.update({
      where: { id: participant.id },
      data: {
        unreadCount: 0,
        archived: false,
      },
    })

    await tx.chatMessage.updateMany({
      where: {
        threadId: participant.threadId,
        senderId: { not: userId },
        isRead: false,
      },
      data: {
        isRead: true,
      },
    })

    const chatSummary = await getChatSummaryForUser(tx, userId, otherUserId)
    return {
      chatSummary,
      readAt: new Date().toISOString(),
    }
  })

  if (result.chatSummary) {
    emitChatRealtimeToUser(userId, {
      channel: "chat",
      type: "chat_updated",
      otherUserId,
      data: result.chatSummary,
    })
  }

  emitChatRealtimeToUser(otherUserId, {
    channel: "chat",
    type: "messages_read",
    otherUserId: userId,
    readAt: result.readAt,
  })

  return { success: true }
}

export async function clearChat(userId: string, otherUserId: string) {
  const participant = await getParticipant(userId, otherUserId)
  if (!participant) {
    return { success: true }
  }

  await prisma.chatParticipant.update({
    where: { id: participant.id },
    data: {
      archived: true,
      unreadCount: 0,
    },
  })

  emitChatRealtimeToUser(userId, {
    channel: "chat",
    type: "chat_cleared",
    otherUserId,
    clearedAt: new Date().toISOString(),
  })

  return { success: true }
}
