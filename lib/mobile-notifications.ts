import "server-only";

import fs from "node:fs";
import path from "node:path";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeMobileUser } from "@/lib/mobile-users";
import { emitChatRealtimeToUser } from "@/lib/realtime";
import { env } from "@/lib/env";
import { sendFcmPush, sendUserNotificationFcm } from "@/lib/fcm";

// Cache-busted so replacing the logo file actually shows up — browsers, CDNs,
// and the mobile app's image cache all key on the URL, and the file gets
// overwritten in place under the same filename, so without a version query
// param an already-cached client keeps showing the old logo forever.
function systemUserAvatarUrl(): string {
  const base = (env.APP_URL || "https://chatandtip.com").replace(/\/$/, "");
  let version = "";
  try {
    const stat = fs.statSync(
      path.join(process.cwd(), "public", "chatandtip-logo.jpg"),
    );
    version = `?v=${Math.round(stat.mtimeMs)}`;
  } catch {
    // Missing at runtime shouldn't happen — fall back to no cache-busting.
  }
  return `${base}/chatandtip-logo.jpg${version}`;
}

type UserWithMedia = Prisma.UserGetPayload<{
  include: { media: true };
}>;

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

const GROUPABLE_ACTIVITY_TYPES = new Set([
  "like",
  "comment",
  "comment_reply",
  "comment_like",
  "repost",
  "follow",
]);

const NOTIFICATION_CATEGORY: Record<string, string> = {
  message: "message", booking: "booking", call: "booking", callback: "booking",
  tip: "tip", tip_request: "tip", like: "social", comment: "social",
  comment_reply: "social", comment_like: "social", comment_mention: "social",
  follow: "social", match: "social", repost: "social", reshare: "social",
  postvideo: "post", post_tag: "post", updatevideo: "post",
};

function preferenceAllowsPush(value: unknown, type: string) {
  const preferences = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  if (preferences.notificationsEnabled === false) return false;
  return preferences[NOTIFICATION_CATEGORY[type] || "system"] !== false;
}

const NOTIFICATION_SOUND_IDS = new Set([
  "default",
  "cat_pulse",
  "cat_ripple",
  "cat_glow",
  "cat_chime",
]);

function notificationSoundId(preferences: Record<string, unknown>) {
  const soundId = String(preferences.soundId || "default");
  return NOTIFICATION_SOUND_IDS.has(soundId) ? soundId : "default";
}

function notificationIosSound(soundId: string) {
  return soundId === "default" ? "default" : `${soundId}.wav`;
}

function mediaIdFromMetadata(metadata: Record<string, unknown>) {
  const raw =
    metadata.mediaId ??
    metadata.videoId ??
    metadata.postId ??
    metadata.reelId ??
    metadata.contentId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

async function enrichMetadataWithMediaPreview(
  metadata: Record<string, unknown>,
) {
  const mediaId = mediaIdFromMetadata(metadata);
  if (!mediaId || typeof metadata.thumbnailUrl === "string") return metadata;
  const media = await prisma.userMedia.findUnique({
    where: { id: mediaId },
    select: { thumbnailUrl: true, url: true },
  });
  if (!media) return metadata;
  return {
    ...metadata,
    mediaId,
    thumbnailUrl: media.thumbnailUrl || media.url || "",
  };
}

async function enrichSerializedNotificationPreviews(items: Array<any>) {
  const missingIds = Array.from(
    new Set(
      items
        .map((item) => mediaIdFromMetadata(normalizeMetadata(item.metadata)))
        .filter(
          (id) =>
            id &&
            typeof normalizeMetadata(
              items.find(
                (item) =>
                  mediaIdFromMetadata(normalizeMetadata(item.metadata)) === id,
              )?.metadata,
            ).thumbnailUrl !== "string",
        ),
    ),
  );
  if (!missingIds.length) return items;
  const mediaRows = await prisma.userMedia.findMany({
    where: { id: { in: missingIds } },
    select: { id: true, thumbnailUrl: true, url: true },
  });
  const previewById = new Map(
    mediaRows.map((media) => [media.id, media.thumbnailUrl || media.url || ""]),
  );
  return items.map((item) => {
    const metadata = normalizeMetadata(item.metadata);
    const mediaId = mediaIdFromMetadata(metadata);
    const thumbnailUrl = mediaId ? previewById.get(mediaId) : "";
    if (!thumbnailUrl || typeof metadata.thumbnailUrl === "string") return item;
    return { ...item, metadata: { ...metadata, mediaId, thumbnailUrl } };
  });
}

function actorName(item: any) {
  const senderUser = item.senderUser as
    Record<string, unknown> | null | undefined;
  const name =
    senderUser?.fullname || senderUser?.fullName || item.title || "Someone";
  return String(name).replace(/^@/, "").trim() || "Someone";
}

function activityVerb(type: string) {
  if (type === "like") return "liked your post";
  if (type === "comment") return "commented on your post";
  if (type === "comment_reply") return "replied to your comment";
  if (type === "comment_like") return "liked your comment";
  if (type === "repost") return "Reshared your post";
  if (type === "follow") return "followed you";
  return "updated your post";
}

function groupSerializedNotifications(items: Array<any>) {
  const grouped = new Map<string, Array<any>>();
  const output: Array<any> = [];

  for (const item of items) {
    const type = String(item.type || "alert");
    const metadata = normalizeMetadata(item.metadata);
    const mediaId = mediaIdFromMetadata(metadata);
    if (
      !GROUPABLE_ACTIVITY_TYPES.has(type) ||
      (type !== "follow" && !mediaId)
    ) {
      output.push(item);
      continue;
    }
    const key = type === "follow" ? "follow" : `${type}:${mediaId}`;
    const list = grouped.get(key) || [];
    if (!list.length) output.push(item);
    list.push(item);
    grouped.set(key, list);
  }

  return output.map((item) => {
    const type = String(item.type || "alert");
    const metadata = normalizeMetadata(item.metadata);
    const mediaId = mediaIdFromMetadata(metadata);
    const list =
      grouped.get(type === "follow" ? "follow" : `${type}:${mediaId}`) || [];
    if (list.length <= 1) return item;

    const actors = list
      .map((entry) => ({
        id: String(entry.senderId || ""),
        name: actorName(entry),
        user: entry.senderUser || null,
      }))
      .filter((actor, index, all) =>
        actor.id
          ? all.findIndex((a) => a.id === actor.id) === index
          : index === all.findIndex((a) => a.name === actor.name),
      );
    const first = actors[0]?.name || "Someone";
    const second = actors[1]?.name;
    const others = Math.max(0, actors.length - 2);
    const title = second
      ? `${first}, ${second}${others > 0 ? ` and ${others} others` : ""} ${activityVerb(type)}`
      : `${first} and ${Math.max(1, actors.length - 1)} others ${activityVerb(type)}`;

    return {
      ...item,
      title,
      message: "",
      isRead: list.every((entry) => entry.isRead === true),
      metadata: {
        ...metadata,
        groupedNotificationIds: list.map((entry) => entry.id),
        activityCount: list.length,
        groupedActorCount: actors.length,
        groupedActors: actors.slice(0, 3),
      },
    };
  });
}

export function serializeMobileNotification(notification: {
  id: string;
  senderId: string | null;
  title: string | null;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata: unknown;
  sender?: UserWithMedia | null;
}) {
  const metadata = normalizeMetadata(notification.metadata);

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
    senderUser: notification.sender
      ? serializeMobileUser(notification.sender as UserWithMedia)
      : null,
  };
}

export async function createUserNotification(input: {
  userId: string;
  senderId?: string | null;
  title?: string | null;
  message: string;
  type?: string;
  metadata?: Record<string, unknown>;
  // Broadcasts already send their own optimized push in a batch loop — they
  // pass skipPush to avoid a duplicate push here.
  skipPush?: boolean;
}) {
  const hiddenByChat = input.senderId && !["chat_hide_request", "chat_unhide_request", "chat_privacy_decision"].includes(input.type ?? "")
    ? await prisma.userHiddenChat.findFirst({
        where: {
          userId: input.userId,
          thread: { participants: { some: { userId: input.senderId } } },
        },
        select: { id: true },
      })
    : null;
  const notification = await prisma.userNotification.create({
    data: {
      userId: input.userId,
      senderId: input.senderId || null,
      title: input.title || null,
      message: input.message,
      type: input.type || "alert",
      hiddenAt: hiddenByChat ? new Date() : null,
      metadata: (await enrichMetadataWithMediaPreview(
        input.metadata || {},
      )) as Prisma.InputJsonValue,
    },
    include: {
      sender: {
        include: { media: true },
      },
    },
  });

  const serialized = serializeMobileNotification(notification as never);

  if (hiddenByChat) return serialized;

  emitChatRealtimeToUser(input.userId, {
    channel: "notifications",
    type: "notification_created",
    data: serialized,
  });

  // Push to the recipient's device so OFFLINE users are alerted too (bookings,
  // likes, comments, tips, etc.). Best-effort — never block on it. FCM data
  // values must be strings, so metadata is stringified for deep-linking.
  if (!input.skipPush) {
    void (async () => {
      try {
        const recipient = await prisma.user.findUnique({
          where: { id: input.userId },
          select: { deviceToken: true, notificationPreferences: true },
        });
        if (!recipient || !preferenceAllowsPush(recipient.notificationPreferences, input.type || "alert")) return;
        const pushData: Record<string, string> = {
          type: input.type || "alert",
          recipientUserId: input.userId,
          notificationId: notification.id,
          senderId: input.senderId || "",
          title: input.title || "ChatAndTip",
          message: input.message,
        };
        for (const [k, v] of Object.entries(input.metadata || {})) {
          if (v != null) pushData[k] = String(v);
        }
        const preferences = recipient.notificationPreferences && typeof recipient.notificationPreferences === "object"
          ? recipient.notificationPreferences as Record<string, unknown>
          : {};
        const soundId = notificationSoundId(preferences);
        await sendUserNotificationFcm(input.userId, recipient.deviceToken, {
          title: input.title || "ChatAndTip",
          body: input.message,
          androidIcon:
            input.type === "tip"
              ? tipNotificationIcon(input.metadata?.tier)
              : undefined,
          androidDataOnly: input.type === "tip",
          androidChannelId: `msg_${soundId}`,
          iosSound: notificationIosSound(soundId),
          data: pushData,
        });
      } catch {
        // ignore — push is best-effort
      }
    })();
  }

  return serialized;
}

function tipNotificationIcon(tier: unknown) {
  switch (String(tier || "").toUpperCase()) {
    case "GEM":
      return "notification_gem";
    case "DIAMOND":
      return "notification_diamond";
    case "PEBBLE":
      return "notification_pebble";
    default:
      return "notification_tip";
  }
}

/**
 * Chat delivery is deliberately separate from Activity. A message should
 * alert the device and open its conversation, but it should not create a
 * second item in the in-app notifications feed.
 */
export async function sendDirectMessagePush(input: {
  userId: string;
  senderId: string;
}) {
  try {
    const participant = await prisma.chatParticipant.findFirst({
      where: { userId: input.userId, otherUserId: input.senderId },
      select: { threadId: true },
    });
    if (participant) {
      const hidden = await prisma.userHiddenChat.findFirst({
        where: { userId: input.userId, threadId: participant.threadId },
        select: { id: true },
      });
      if (hidden) return false;
      const muted = await prisma.chatMute.findUnique({
        where: { userId_threadId: { userId: input.userId, threadId: participant.threadId } },
        select: { id: true },
      });
      if (muted) return false;
    }
    const recipient = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { deviceToken: true, notificationPreferences: true },
    });
    if (!recipient || !preferenceAllowsPush(recipient.notificationPreferences, "message")) return false;
    const preferences = recipient.notificationPreferences && typeof recipient.notificationPreferences === "object"
      ? recipient.notificationPreferences as Record<string, unknown>
      : {};
    const soundId = notificationSoundId(preferences);
    const { publicChatPeerId } = await import("@/lib/chat-identity");
    const publicSenderId = await publicChatPeerId(input.userId, input.senderId);
    return (await sendUserNotificationFcm(input.userId, recipient.deviceToken, {
      title: "ChatAndTip",
      body: "You have a new message",
      androidChannelId: `msg_${soundId}`,
      iosSound: notificationIosSound(soundId),
      data: {
        type: "message",
        recipientUserId: input.userId,
        senderId: publicSenderId,
        threadUserId: publicSenderId,
        targetType: "chat",
        soundId,
      },
    })) > 0;
  } catch {
    return false;
  }
}

export async function listUserNotifications(input: {
  userId: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, input.page || 1);
  const limit = Math.min(50, Math.max(1, input.limit || 20));
  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    prisma.userNotification.findMany({
      where: { userId: input.userId, hiddenAt: null, type: { notIn: ["broadcast", "postvideo", "support_response", "chat_hide_request", "chat_unhide_request", "chat_privacy_decision"] } },
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
      where: { userId: input.userId, hiddenAt: null, type: { notIn: ["broadcast", "postvideo", "support_response", "chat_hide_request", "chat_unhide_request", "chat_privacy_decision"] } },
    }),
  ]);

  const serialized = notifications.map((notification) =>
    serializeMobileNotification(notification as never),
  );
  const withPreviews = await enrichSerializedNotificationPreviews(serialized);
  return {
    data: groupSerializedNotifications(withPreviews),
    page,
    limit,
    hasMore: skip + notifications.length < total,
    total,
  };
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
  isRead = true,
) {
  const notification = await prisma.userNotification.findFirst({
    where: {
      id: notificationId,
      userId,
    },
  });

  if (!notification) {
    throw new Error("Notification not found");
  }

  const updated = await prisma.userNotification.update({
    where: { id: notificationId },
    data: { isRead },
    include: {
      sender: {
        include: { media: true },
      },
    },
  });

  const metadata = normalizeMetadata(notification.metadata);
  if (
    isRead &&
    notification.type === "broadcast" &&
    typeof metadata.threadId === "string"
  ) {
    await prisma.chatParticipant.updateMany({
      where: { threadId: metadata.threadId, userId },
      data: { unreadCount: 0 },
    });
  }

  emitChatRealtimeToUser(userId, {
    channel: "notifications",
    type: "notification_updated",
    notificationId,
    data: serializeMobileNotification(updated as never),
  });

  return { success: true };
}

export async function setNotificationsRead(
  userId: string,
  isRead: boolean,
  notificationIds?: string[],
) {
  const ids = Array.from(new Set((notificationIds || []).filter(Boolean)));
  const result = await prisma.userNotification.updateMany({
    where: {
      userId,
      ...(ids.length ? { id: { in: ids } } : {}),
    },
    data: { isRead },
  });
  emitChatRealtimeToUser(userId, {
    channel: "notifications",
    type: "notifications_refresh",
    refreshedAt: new Date().toISOString(),
  });
  return { success: true, updated: result.count, isRead };
}

export async function deleteSingleNotification(
  userId: string,
  notificationId: string,
) {
  const result = await prisma.userNotification.deleteMany({
    where: { id: notificationId, userId },
  });
  return { success: true, deleted: result.count };
}

export async function deleteAllNotifications(userId: string) {
  const result = await prisma.userNotification.deleteMany({
    where: { userId },
  });

  emitChatRealtimeToUser(userId, {
    channel: "notifications",
    type: "notifications_cleared",
    clearedAt: new Date().toISOString(),
  });

  return { success: true, deleted: result.count };
}

type TargetFilter = {
  roles?: ("USER" | "CREATOR")[];
  gender?: string[];
  verified?: boolean;
  createdAfter?: string;
  userIds?: string[];
};

export async function broadcastCampaignNotifications(input: {
  title?: string | null;
  message: string;
  campaignId: string;
  channel?: string;
  /** Deliver only to the broadcast chat, without an activity or device notification. */
  createNotification?: boolean;
  afterUserId?: string;
  batchSize?: number;
  targetFilter?: TargetFilter | null;
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
      avatarUrl: systemUserAvatarUrl(),
    },
    update: {
      fullName: "ChatAndTip",
      verified: true,
      avatarUrl: systemUserAvatarUrl(),
    },
    include: { media: true },
  });

  const tf = input.targetFilter;
  const roleFilter = tf?.roles?.length
    ? tf.roles.map((r) => UserRole[r as keyof typeof UserRole])
    : [UserRole.USER];

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
      ...(tf?.createdAfter
        ? { createdAt: { gte: new Date(tf.createdAfter) } }
        : {}),
    },
    select: { id: true, deviceToken: true, notificationPreferences: true },
    orderBy: { id: "asc" },
    take: Math.min(500, Math.max(1, input.batchSize || 200)),
  });

  if (!users.length) {
    return { created: 0 };
  }

  const sentAt = new Date();
  for (const user of users) {
    const delivery = await prisma.$transaction(async (tx) => {
      let participant = await tx.chatParticipant.findFirst({
        where: {
          userId: user.id,
          otherUserId: systemUser.id,
          thread: { kind: "BROADCAST" },
        },
        include: { thread: true },
      });
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
        });
        participant = await tx.chatParticipant.findFirstOrThrow({
          where: { threadId: thread.id, userId: user.id },
          include: { thread: true },
        });
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
      });
      await tx.chatThread.update({
        where: { id: participant.threadId },
        data: {
          lastMessageText: input.message,
          lastMessageType: "SYSTEM",
          lastMessageAt: sentAt,
        },
      });
      const recipient = await tx.chatParticipant.update({
        where: { id: participant.id },
        data: { unreadCount: { increment: 1 }, archived: false },
      });
      return { message, unread: recipient.unreadCount };
    });

    const createdNotification =
      input.createNotification === false
        ? null
        : await createUserNotification({
            userId: user.id,
            senderId: systemUser.id,
            title: input.title || "ChatAndTip",
            message: input.message,
            type: "broadcast",
            metadata: {
              campaignId: input.campaignId,
              threadId: delivery.message.threadId,
              targetType: "broadcast",
              channel: input.channel || "IN_APP",
            },
            skipPush: true, // broadcast loop sends its own FCM push below
          });

    // FCM push for offline users — fire-and-forget, doesn't block the loop
    if (createdNotification && user.deviceToken && preferenceAllowsPush(user.notificationPreferences, "broadcast")) {
      const push = sendFcmPush(user.deviceToken, {
        title: input.title || "ChatAndTip",
        body: input.message,
        androidChannelId:
          user.notificationPreferences &&
          typeof user.notificationPreferences === "object" &&
          (user.notificationPreferences as Record<string, unknown>).vibrationEnabled === false
            ? "chatandtip_silent"
            : "chatandtip",
        iosSound:
          user.notificationPreferences &&
          typeof user.notificationPreferences === "object" &&
          (user.notificationPreferences as Record<string, unknown>).vibrationEnabled === false
            ? null
            : "default",
        data: {
          type: "broadcast",
          recipientUserId: user.id,
          senderId: systemUser.id,
          campaignId: input.campaignId,
          title: input.title || "ChatAndTip",
          message: input.message,
          threadId: delivery.message.threadId,
        },
      });
      if (input.campaignId.startsWith("welcome:")) {
        try {
          await push;
          await prisma.userNotification.update({
            where: { id: createdNotification.id },
            data: {
              metadata: {
                ...normalizeMetadata(createdNotification.metadata),
                pushDeliveredAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          });
        } catch {
          // The first profile update retries welcome delivery once a token is available.
        }
      } else {
        push.catch(() => {});
      }
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
    });
  }

  return { created: users.length, lastUserId: users.at(-1)?.id || null };
}
