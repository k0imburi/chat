import "server-only"

import { Prisma, UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { serializeMobileUser } from "@/lib/mobile-users"
import { emitChatRealtimeToUser } from "@/lib/realtime"

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

  emitChatRealtimeToUser(userId, {
    channel: "notifications",
    type: "notification_updated",
    notificationId,
    data: serializeMobileNotification(updated as never),
  })

  return { success: true }
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

export async function broadcastCampaignNotifications(input: {
  title?: string | null
  message: string
  campaignId: string
  channel?: string
}) {
  const users = await prisma.user.findMany({
    where: {
      role: UserRole.USER,
      isActive: true,
    },
    select: { id: true },
  })

  if (!users.length) {
    return { created: 0 }
  }

  const created = await prisma.userNotification.createMany({
    data: users.map((user) => ({
      userId: user.id,
      title: input.title || null,
      message: input.message,
      type: "alert",
      metadata: {
        campaignId: input.campaignId,
        channel: input.channel || "IN_APP",
      } as Prisma.InputJsonValue,
    })),
  })

  const refreshedAt = new Date().toISOString()
  for (const user of users) {
    emitChatRealtimeToUser(user.id, {
      channel: "notifications",
      type: "notifications_refresh",
      refreshedAt,
    })
  }

  return { created: created.count }
}
