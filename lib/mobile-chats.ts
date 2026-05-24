import "server-only"

import { ChatMessageType, Prisma, UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { serializeMobileUser } from "@/lib/mobile-users"
import { emitChatRealtimeToUser } from "@/lib/realtime"

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
  isRead: boolean
  sentAt: Date
}) {
  return {
    id: message.id,
    chatId: message.threadId,
    senderId: message.senderId,
    type: parseChatMessageType(message.type),
    textMsg: message.text || "",
    imageUrl: message.imageUrl || "",
    isRead: message.isRead,
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

    const message = await tx.chatMessage.create({
      data: {
        threadId,
        senderId: input.senderId,
        type: messageType,
        text: textMsg || null,
        imageUrl: imageUrl || null,
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

    await tx.userNotification.create({
      data: {
        userId: input.receiverId,
        senderId: input.senderId,
        title: me.fullName,
        message: textMsg || "Sent you a photo",
        type: "message",
        metadata: {
          threadUserId: input.senderId,
          messageId: message.id,
        },
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
