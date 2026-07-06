import "server-only"

import { Prisma, UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { serializeMobileUser } from "@/lib/mobile-users"
import { emitChatRealtimeToUser } from "@/lib/realtime"
import { env } from "@/lib/env"
import { sendFcmPush } from "@/lib/fcm"

type UserWithMedia = Prisma.UserGetPayload<{
  include: { media: true }
}>

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

export function serializeMobileNotification(notification: {
  id: string
  senderId: string | null
  title: string | null
  message: string
  type: string
  isRead: boolean
  createdAt: Date
  updatedAt: Date
  metadata: unknown
  sender?: UserWithMedia | null
}) {
  const metadata = normalizeMetadata(notification.metadata)

  return {
    id: notification.id,
    senderId: notification.senderId || "",
    title: notification.title || "",
    message: notification.message,
    type: notification.type,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
    videoIndex: Number(metadata.videoIndex ?? 0),
    metadata,
    senderUser: notification.sender ? serializeMobileUser(notification.sender as UserWithMedia) : null,
  }
}

export async function createUserNotification(input: {
  userId: string
  senderId?: string | null
  title?: string | null
  message: string
  type?: string
  metadata?: Record<string, unknown>
}) {
  const notification = await prisma.userNotification.create({
    data: {
      userId: input.userId,
      senderId: input.senderId || null,
      title: input.title || null,
      message: input.message,
      type: input.type || "alert",
      metadata: (input.metadata || {}) as Prisma.InputJsonValue,
    },
    include: {
      sender: {
        include: { media: true },
      },
    },
  })

  const serialized = serializeMobileNotification(notification as never)

  emitChatRealtimeToUser(input.userId, {
    channel: "notifications",
    type: "notification_created",
    data: serialized,
  })

  return serialized
}

export async function listUserNotifications(input: {
  userId: string
  page?: number
  limit?: number
}) {
  const page = Math.max(1, input.page || 1)
  const limit = Math.min(50, Math.max(1, input.limit || 20))
  const skip = (page - 1) * limit

  const [notifications, total] = await Promise.all([
    prisma.userNotification.findMany({
      where: { userId: input.userId },
      include: {
        sender: {
          include: { media: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: limit,
    }),
    prisma.userNotification.count({
      where: { userId: input.userId },
    }),
  ])

  return {
    data: notifications.map((notification) => serializeMobileNotification(notification as never)),
    page,
    limit,
    hasMore: skip + notifications.length < total,
    total,
  }
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await prisma.userNotification.findFirst({
    where: {
      id: notificationId,
      userId,
    },
  })

  if (!notification) {
    throw new Error("Notification not found")
  }

  const updated = await prisma.userNotification.update({
    where: { id: notificationId },
    data: { isRead: true },
    include: {
      sender: {
        include: { media: true },
      },
    },
  })

  const metadata = normalizeMetadata(notification.metadata)
  if (notification.type === "broadcast" && typeof metadata.threadId === "string") {
    await prisma.chatParticipant.updateMany({
      where: { threadId: metadata.threadId, userId },
      data: { unreadCount: 0 },
    })
  }

  emitChatRealtimeToUser(userId, {
    channel: "notifications",
    type: "notification_updated",
    notificationId,
    data: serializeMobileNotification(updated as never),
  })

  return { success: true }
}

export async function deleteSingleNotification(userId: string, notificationId: string) {
  const result = await prisma.userNotification.deleteMany({
    where: { id: notificationId, userId },
  })
  return { success: true, deleted: result.count }
}

export async function deleteAllNotifications(userId: string) {
  const result = await prisma.userNotification.deleteMany({
    where: { userId },
  })

  emitChatRealtimeToUser(userId, {
    channel: "notifications",
    type: "notifications_cleared",
    clearedAt: new Date().toISOString(),
  })

  return { success: true, deleted: result.count }
}

type TargetFilter = {
  roles?: ('USER' | 'CREATOR')[]
  gender?: string[]
  verified?: boolean
  createdAfter?: string
  userIds?: string[]
}

export async function broadcastCampaignNotifications(input: {
  title?: string | null
  message: string
  campaignId: string
  channel?: string
  afterUserId?: string
  batchSize?: number
  targetFilter?: TargetFilter | null
}) {
  const systemUser = await prisma.user.upsert({
    where: { externalId: "system:chatandtip" },
    create: {
      externalId: "system:chatandtip",
      fullName: "ChatAndTip",
      username: "chatandtip",
      gender: "SYSTEM",
      email: "broadcast@chatandtip.system",
      role: UserRole.USER,
      verified: true,
      avatarUrl: `${(env.APP_URL || "https://chatandtip.com").replace(/\/$/, "")}/chatandtip-logo.jpg`,
    },
    update: { fullName: "ChatAndTip", verified: true },
    include: { media: true },
  })

  const tf = input.targetFilter
  const roleFilter = tf?.roles?.length
    ? tf.roles.map((r) => UserRole[r as keyof typeof UserRole])
    : [UserRole.USER]

  const users = await prisma.user.findMany({
    where: {
      role: { in: roleFilter },
      isActive: true,
      id: {
        not: systemUser.id,
        ...(input.afterUserId ? { gt: input.afterUserId } : {}),
        ...(tf?.userIds?.length ? { in: tf.userIds } : {}),
      },
      ...(tf?.gender?.length ? { gender: { in: tf.gender } } : {}),
      ...(tf?.verified !== undefined ? { verified: tf.verified } : {}),
      ...(tf?.createdAfter ? { createdAt: { gte: new Date(tf.createdAfter) } } : {}),
    },
    select: { id: true, deviceToken: true },
    orderBy: { id: "asc" },
    take: Math.min(500, Math.max(1, input.batchSize || 200)),
  })

  if (!users.length) {
    return { created: 0 }
  }

  const sentAt = new Date()
  for (const user of users) {
    const delivery = await prisma.$transaction(async (tx) => {
      let participant = await tx.chatParticipant.findFirst({
        where: {
          userId: user.id,
          otherUserId: systemUser.id,
          thread: { kind: "BROADCAST" },
        },
        include: { thread: true },
      })
      if (!participant) {
        const thread = await tx.chatThread.create({
          data: {
            kind: "BROADCAST",
            broadcastOnly: true,
            initiatorId: systemUser.id,
            participants: {
              create: [
                { userId: systemUser.id, otherUserId: user.id },
                { userId: user.id, otherUserId: systemUser.id },
              ],
            },
          },
        })
        participant = await tx.chatParticipant.findFirstOrThrow({
          where: { threadId: thread.id, userId: user.id },
          include: { thread: true },
        })
      }

      const message = await tx.chatMessage.create({
        data: {
          threadId: participant.threadId,
          senderId: systemUser.id,
          type: "SYSTEM",
          text: input.message,
          reactions: {},
          broadcastCampaignId: input.campaignId,
          sentAt,
        },
      })
      await tx.chatThread.update({
        where: { id: participant.threadId },
        data: { lastMessageText: input.message, lastMessageType: "SYSTEM", lastMessageAt: sentAt },
      })
      const recipient = await tx.chatParticipant.update({
        where: { id: participant.id },
        data: { unreadCount: { increment: 1 }, archived: false },
      })
      return { message, unread: recipient.unreadCount }
    })

    await createUserNotification({
      userId: user.id,
      senderId: systemUser.id,
      title: input.title || "ChatAndTip",
      message: input.message,
      type: "broadcast",
      metadata: { campaignId: input.campaignId, threadId: delivery.message.threadId, targetType: "broadcast", channel: input.channel || "IN_APP" },
    })

    // FCM push for offline users — fire-and-forget, doesn't block the loop
    if (user.deviceToken) {
      sendFcmPush(user.deviceToken, {
        title: input.title || "ChatAndTip",
        body: input.message,
        data: { type: "broadcast", campaignId: input.campaignId },
      }).catch(() => {})
    }

    emitChatRealtimeToUser(user.id, {
      channel: "chat",
      type: "chat_updated",
      otherUserId: systemUser.id,
      data: {
        chatUserId: systemUser.id,
        senderId: systemUser.id,
        msgType: "system",
        lastMsg: input.message,
        sentAt: delivery.message.sentAt.toISOString(),
        unread: delivery.unread,
        receiver: serializeMobileUser(systemUser),
        broadcastOnly: true,
      },
    })
  }

  return { created: users.length, lastUserId: users.at(-1)?.id || null }
}
