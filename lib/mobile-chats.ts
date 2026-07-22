import "server-only"

import { ChatMessageType, CreditKind, Prisma, PrismaClient, UserRole } from "@prisma/client"
import { prisma, withDbRetry } from "@/lib/prisma"
import { serializeMobileUser } from "@/lib/mobile-users"
import { emitChatRealtimeToUser } from "@/lib/realtime"
import { createUserNotification } from "@/lib/mobile-notifications"
import { consumeCreditInTransaction, getCreditBalances } from "@/lib/mobile-credits"
import { getSignedPrivateR2DownloadUrl } from "@/lib/r2"

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
  const contentIsLocked = Boolean(lastMessage.locked && lastMessage.senderId !== participant.userId)

  return {
    chatUserId: receiver.id,
    senderId: lastMessage.senderId,
    msgType: parseChatMessageType(lastMessage.type),
    lastMsg: contentIsLocked ? "Locked reply" : lastMessage.text || "",
    sentAt: lastMessage.sentAt.toISOString(),
    unread: participant.unreadCount,
    broadcastOnly: participant.thread.broadcastOnly,
    threadKind: participant.thread.kind.toLowerCase(),
    receiver: serializeMobileUser(receiver),
  }
}

const UNLOCK_WINDOW_MS = 24 * 60 * 60 * 1000

// A conversation's unlock is a fixed 24h grant from the moment a Key was
// last spent — not a rolling window — so it expires exactly 24h after
// `unlockedAt` regardless of how much chatting happened in between.
function isUnlockWindowValid(unlockedAt: Date | null): boolean {
  return unlockedAt != null && Date.now() - unlockedAt.getTime() < UNLOCK_WINDOW_MS
}

function buildLockedPreview(text: string, contentType: string): string {
  if (contentType === "image") return ""
  if (text.startsWith("enc:")) return ""
  const preview = text.slice(0, 10)
  return preview.length < text.length ? `${preview}…` : preview
}

function serializeChatMessage(message: {
  id: string
  threadId: string
  senderId: string
  type: ChatMessageType
  text: string | null
  previewText?: string | null
  imageUrl: string | null
  imageObjectKey?: string | null
  replyToId: string | null
  replyToText: string | null
  replyToSenderId: string | null
  replyToSenderName: string | null
  reactions: unknown
  isRead: boolean
  locked?: boolean
  sentAt: Date
}, options?: { viewerId?: string; unlockKind?: "KEY" | "CHAT_CREDIT" }) {
  const hideContent = Boolean(
    message.locked && options?.viewerId && message.senderId !== options.viewerId,
  )
  const rawText = message.text || ""
  const lockedContentType = message.imageUrl || message.imageObjectKey
    ? "image"
    : /https?:\/\/\S+/i.test(rawText)
      ? "link"
      : "text"
  // Client-captured plaintext preview covers encrypted text; fall back to
  // slicing rawText for older/unencrypted messages sent before this existed.
  const lockedPreview = message.previewText
    ? `${message.previewText}…`
    : buildLockedPreview(rawText, lockedContentType)

  return {
    id: message.id,
    chatId: message.threadId,
    senderId: message.senderId,
    type: parseChatMessageType(message.type),
    textMsg: hideContent ? lockedPreview : rawText,
    imageUrl: hideContent ? "" : message.imageUrl || "",
    replyToId: message.replyToId || "",
    replyToText: hideContent ? "" : message.replyToText || "",
    replyToSenderId: message.replyToSenderId || "",
    replyToSenderName: message.replyToSenderName || "",
    reactions: normalizeReactions(message.reactions),
    isRead: message.isRead,
    locked: hideContent,
    lockedContentType: hideContent ? lockedContentType : "",
    unlockKind: hideContent ? options?.unlockKind ?? "CHAT_CREDIT" : "",
    sentAt: message.sentAt.toISOString(),
  }
}

async function serializeChatMessageForViewer(
  message: Parameters<typeof serializeChatMessage>[0],
  viewerId: string,
  unlockKind?: "KEY" | "CHAT_CREDIT",
) {
  const serialized = serializeChatMessage(message, { viewerId, unlockKind })
  if (!serialized.locked && message.imageObjectKey) {
    serialized.imageUrl = await getSignedPrivateR2DownloadUrl(message.imageObjectKey)
  }
  return serialized
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

// Accepts either the main client or a transaction client — this is
// deliberately run OUTSIDE sendMessage's transaction (see below): it's a
// read-only summary for realtime broadcast, not something that needs to be
// atomic with the message write, and its `include: { media: true }` can be
// a genuinely heavy query for a creator with a large gallery — heavy enough
// on its own to blow Prisma's 5s interactive-transaction budget.
async function getChatSummaryForUser(
  db: Prisma.TransactionClient | PrismaClient,
  userId: string,
  otherUserId: string,
) {
  const [participant, receiver] = await Promise.all([
    db.chatParticipant.findFirst({
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
    db.user.findFirst({
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
    // Lazily backfill initiatorId for threads that predate the locking system.
    const thread = await tx.chatThread.findUnique({
      where: { id: existing.threadId },
      select: { initiatorId: true },
    })
    if (!thread?.initiatorId) {
      const firstMsg = await tx.chatMessage.findFirst({
        where: { threadId: existing.threadId },
        orderBy: { sentAt: "asc" },
        select: { senderId: true },
      })
      await tx.chatThread.update({
        where: { id: existing.threadId },
        data: { initiatorId: firstMsg?.senderId ?? userId },
      })
    }
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
  if (!participant) return { messages: [], willChargeReply: false }

  const clearedAt = participant.clearedAt

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

    const campaignIds = await tx.chatMessage.findMany({
      where: { threadId: participant.threadId, broadcastCampaignId: { not: null } },
      select: { broadcastCampaignId: true },
      distinct: ["broadcastCampaignId"],
    })
    for (const campaign of campaignIds) {
      if (!campaign.broadcastCampaignId) continue
      await tx.userNotification.updateMany({
        where: {
          userId,
          type: "broadcast",
          metadata: { path: "$.campaignId", equals: campaign.broadcastCampaignId },
        },
        data: { isRead: true },
      })
    }

    const [messages, threadState, viewer] = await Promise.all([
      tx.chatMessage.findMany({
        where: {
          threadId: participant.threadId,
          ...(clearedAt ? { sentAt: { gt: clearedAt } } : {}),
        },
        orderBy: { sentAt: "desc" },
      }),
      tx.chatThread.findUniqueOrThrow({
        where: { id: participant.threadId },
        select: { unlockedAt: true, initiatorId: true, broadcastOnly: true },
      }),
      tx.user.findUnique({ where: { id: userId }, select: { earningSuspendedUntil: true } }),
    ])

    // The viewer's next reply needs a fresh Key unlock (and so enforces the
    // 100-char minimum in the composer) when the viewer is the
    // non-initiator, is not earning-suspended, the thread isn't
    // broadcast-only, and the unlock window is currently invalid (never
    // opened, or expired). Once a window is open, replies flow normally with
    // no length requirement — whether actively auto-deducting or paused for
    // a ChatCredit top-up.
    const earningSuspended = Boolean(viewer?.earningSuspendedUntil && viewer.earningSuspendedUntil > new Date())
    const willChargeReply = Boolean(
      !threadState.broadcastOnly &&
      !earningSuspended &&
      threadState.initiatorId != null &&
      threadState.initiatorId !== userId &&
      !isUnlockWindowValid(threadState.unlockedAt),
    )

    // Only one Key per conversation per 24h window — within a valid window,
    // unlocking always spends a ChatCredit, regardless of current balance.
    const unlockKind: "KEY" | "CHAT_CREDIT" = isUnlockWindowValid(threadState.unlockedAt) ? "CHAT_CREDIT" : "KEY"

    return {
      messages,
      unlockKind,
      willChargeReply,
      readAt: new Date().toISOString(),
    }
  })

  // Outside the transaction — read-only broadcast summary, not required to
  // be atomic with the writes above (see getChatSummaryForUser's comment).
  const chatSummary = await getChatSummaryForUser(prisma, userId, otherUserId)
  if (chatSummary) {
    emitChatRealtimeToUser(userId, {
      channel: "chat",
      type: "chat_updated",
      otherUserId,
      data: chatSummary,
    })
  }

  emitChatRealtimeToUser(otherUserId, {
    channel: "chat",
    type: "messages_read",
    otherUserId: userId,
    readAt: result.readAt,
  })

  const serializedMessages = await Promise.all(
    result.messages.map((message) =>
      serializeChatMessageForViewer(message, userId, result.unlockKind),
    ),
  )
  return { messages: serializedMessages, willChargeReply: result.willChargeReply }
}

export async function sendMessage(input: {
  senderId: string
  receiverId: string
  textMsg?: string
  previewText?: string
  textLength?: number
  imageUrl?: string
  imageObjectKey?: string
  replyToId?: string
  replyToText?: string
  replyToSenderId?: string
  replyToSenderName?: string
}) {
  const textMsg = input.textMsg?.trim() || ""
  const previewText = input.previewText?.trim().slice(0, 10) || ""
  const imageUrl = input.imageUrl?.trim() || ""
  const imageObjectKey = input.imageObjectKey?.trim() || ""

  if (!textMsg && !imageUrl && !imageObjectKey) {
    throw new Error("Message content is required")
  }

  const { me, other } = await ensureUsersCanChat(input.senderId, input.receiverId)

  const result = await withDbRetry(() => prisma.$transaction(async (tx) => {
    const threadId = await getOrCreateThread(input.senderId, input.receiverId, tx)
    const messageType = imageUrl || imageObjectKey ? ChatMessageType.IMAGE : ChatMessageType.TEXT

    // A creator's first reply stays locked until the initiator opens the
    // conversation. Once unlocked, the chat behaves like SMS: the initiator
    // pays one ChatCredit when sending; creator replies are free.
    const thread = await tx.chatThread.findUnique({
      where: { id: threadId },
      select: { initiatorId: true, unlockedAt: true, broadcastOnly: true },
    })
    if (thread?.broadcastOnly) throw new Error("Replies are not available for broadcast messages")

    // Turn-taking: a conversation alternates sender/receiver — nobody can
    // send twice in a row without the other party replying in between.
    const lastMessage = await tx.chatMessage.findFirst({
      where: { threadId },
      orderBy: { sentAt: "desc" },
      select: { senderId: true },
    })
    if (lastMessage && lastMessage.senderId === input.senderId) {
      throw new Error("Wait for a reply before sending another message")
    }

    const earningSuspended = Boolean(me.earningSuspendedUntil && me.earningSuspendedUntil > new Date())
    const isNonInitiator = thread?.initiatorId != null && thread.initiatorId !== input.senderId
    let locked = false
    let autoDeductCredit = false
    // Only true for a creator's first reply after a conversation has never
    // been unlocked or its 24-hour window has expired.
    let needsKeyUnlock = false
    const isInitiator = thread?.initiatorId === input.senderId
    const unlockWindowValid = isUnlockWindowValid(thread?.unlockedAt ?? null)
    if (isInitiator && !unlockWindowValid) {
      const lockedReply = await tx.chatMessage.findFirst({
        where: {
          threadId,
          locked: true,
          senderId: { not: input.senderId },
        },
        select: { id: true },
      })
      if (lockedReply) {
        throw new Error("Unlock the conversation before sending a message")
      }
    }
    if (!earningSuspended && isNonInitiator && !unlockWindowValid) {
      // Never unlocked yet, or grant expired: this creator reply starts the
      // locked conversation the initiator must open with a Key.
      locked = true
      needsKeyUnlock = true
    }
    if (isInitiator && unlockWindowValid) {
      // The initiator pays when they send, never when the creator replies.
      // consumeCreditInTransaction makes this atomic and rolls back the
      // message if the initiator has no ChatCredits left.
      autoDeductCredit = true
    }
    if (locked && imageUrl && !imageObjectKey) {
      throw new Error("Paid image replies must use private upload storage")
    }
    // For encrypted text, the client reports the true plaintext length —
    // textMsg.length would measure ciphertext, which is always inflated.
    const effectiveLength = textMsg.startsWith("enc:") ? (input.textLength ?? 0) : textMsg.length
    // Only the creator reply that starts a locked conversation enforces the
    // 100-character minimum. Once the window is open, normal messages have
    // no length requirement.
    if (needsKeyUnlock && !imageUrl && !imageObjectKey && effectiveLength < 100) {
      throw new Error("Paid replies must be at least 100 characters")
    }

    const message = await tx.chatMessage.create({
      data: {
        threadId,
        senderId: input.senderId,
        type: messageType,
        text: textMsg || null,
        previewText: previewText || null,
        imageUrl: imageUrl || null,
        imageObjectKey: imageObjectKey || null,
        replyToId: input.replyToId || null,
        replyToText: input.replyToText || null,
        replyToSenderId: input.replyToSenderId || null,
        replyToSenderName: input.replyToSenderName || null,
        reactions: {},
        locked,
      },
    })

    // Deduct one ChatCredit only when the initiator sends in an open window.
    if (autoDeductCredit) {
      await consumeCreditInTransaction(tx, {
        userId: input.senderId,
        creatorId: input.receiverId,
        kind: "CHAT_CREDIT" as CreditKind,
        idempotencyKey: `autochat:${message.id}`,
        metadata: { threadId, messageId: message.id, autoDeducted: true },
      })
    }

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

    return {
      message,
      unlockKind: needsKeyUnlock ? "KEY" as const : "CHAT_CREDIT" as const,
      locked,
    }
  }))

  // Deliberately computed after the transaction commits — these are
  // read-only realtime-broadcast summaries, not something that needs to be
  // atomic with the write above (see getChatSummaryForUser's comment).
  const [senderMessage, receiverMessage, senderSummary, receiverSummary] = await Promise.all([
    serializeChatMessageForViewer(result.message, input.senderId),
    serializeChatMessageForViewer(result.message, input.receiverId, result.unlockKind),
    getChatSummaryForUser(prisma, input.senderId, input.receiverId),
    getChatSummaryForUser(prisma, input.receiverId, input.senderId),
  ])

  await createUserNotification({
    userId: input.receiverId,
    senderId: input.senderId,
    title: me.fullName,
    message: result.locked ? "Sent you a locked reply" : textMsg || "Sent you a photo",
    type: "message",
    metadata: {
      threadUserId: input.senderId,
      messageId: senderMessage.id,
    },
  })

  emitChatRealtimeToUser(input.senderId, {
    channel: "chat",
    type: "message_created",
    otherUserId: input.receiverId,
    data: senderMessage,
  })

  emitChatRealtimeToUser(input.receiverId, {
    channel: "chat",
    type: "message_created",
    otherUserId: input.senderId,
    data: receiverMessage,
  })

  if (senderSummary) {
    emitChatRealtimeToUser(input.senderId, {
      channel: "chat",
      type: "chat_updated",
      otherUserId: input.receiverId,
      data: senderSummary,
    })
  }

  if (receiverSummary) {
    emitChatRealtimeToUser(input.receiverId, {
      channel: "chat",
      type: "chat_updated",
      otherUserId: input.senderId,
      data: receiverSummary,
    })
  }

  return { ...senderMessage, receiver: serializeMobileUser(other) }
}

/**
 * Unlock a locked reply. Only the thread initiator (the paying user) may
 * unlock. Only one Key may be spent per conversation per 24h window: if the
 * window has expired (or never started), unlocking spends a Key and opens a
 * fresh 24h grant starting now. If the window is still valid — meaning
 * credits simply ran out mid-window — unlocking always spends a ChatCredit,
 * never a second Key; the window itself is left untouched. Throws
 * InsufficientCreditsError ("You have insufficient Balance") when the
 * initiator has no matching credit — the client should prompt to buy more
 * ChatCredits in that case, not offer a Key.
 */
export async function unlockReply(input: { userId: string; messageId: string }) {
  const result = await prisma.$transaction(async (tx) => {
    const message = await tx.chatMessage.findUnique({
      where: { id: input.messageId },
      include: { thread: { select: { id: true, initiatorId: true, unlockedAt: true } } },
    })
    if (!message) throw new Error("Message not found")
    if (message.thread.initiatorId !== input.userId) {
      throw new Error("Only the conversation initiator can unlock replies")
    }

    // Claim this message before charging. A concurrent retry observes count=0
    // and returns without spending a second credit.
    const claimed = await tx.chatMessage.updateMany({
      where: { id: message.id, locked: true },
      data: { locked: false },
    })
    if (claimed.count === 0) {
      const current = await tx.chatMessage.findUniqueOrThrow({ where: { id: message.id } })
      return { message: current, creatorId: message.senderId }
    }

    // Only one Key per conversation per 24h window — a mid-window credit
    // shortfall always resolves with a ChatCredit (or throws for the client
    // to prompt a top-up), never a second Key.
    const kind: CreditKind = isUnlockWindowValid(message.thread.unlockedAt) ? "CHAT_CREDIT" : "KEY"

    if (kind === "KEY") {
      // Spending a Key (re-)opens the conversation: a fresh fixed 24h grant
      // starting now, regardless of why the previous one lapsed.
      await tx.chatThread.update({
        where: { id: message.thread.id },
        data: { unlockedAt: new Date(), icebreakerUnlocked: true },
      })
    }

    await consumeCreditInTransaction(tx, {
      userId: input.userId,
      creatorId: message.senderId,
      kind,
      idempotencyKey: `unlock:${message.id}`,
      metadata: { threadId: message.thread.id, messageId: message.id },
    })

    const updated = await tx.chatMessage.findUniqueOrThrow({ where: { id: message.id } })
    return { message: updated, creatorId: message.senderId }
  }, { timeout: 20000, maxWait: 10000 })

  const serialized = await serializeChatMessageForViewer(result.message, input.userId)

  // Push the now-unlocked message to both parties in real time.
  emitChatRealtimeToUser(input.userId, {
    channel: "chat",
    type: "message_updated",
    otherUserId: result.creatorId,
    data: serialized,
  })
  emitChatRealtimeToUser(result.creatorId, {
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

    return {
      readAt: new Date().toISOString(),
    }
  })

  // Outside the transaction — read-only broadcast summary, not required to
  // be atomic with the writes above (see getChatSummaryForUser's comment).
  const chatSummary = await getChatSummaryForUser(prisma, userId, otherUserId)
  if (chatSummary) {
    emitChatRealtimeToUser(userId, {
      channel: "chat",
      type: "chat_updated",
      otherUserId,
      data: chatSummary,
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
      clearedAt: new Date(),
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

export async function deleteMessage(userId: string, otherUserId: string, messageId: string) {
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: { thread: { select: { id: true } } },
  })
  if (!message) throw new Error("Message not found")
  if (message.senderId !== userId) throw new Error("You can only delete your own messages")

  await prisma.chatMessage.delete({ where: { id: messageId } })

  const event = {
    channel: "chat" as const,
    type: "message_deleted" as const,
    otherUserId,
    messageId,
    chatId: message.threadId,
  }
  emitChatRealtimeToUser(userId, event)
  emitChatRealtimeToUser(otherUserId, event)
}
