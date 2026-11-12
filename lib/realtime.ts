import "server-only"
import { protectChatPayload } from "@/lib/chat-identity"

export type ChatRealtimeEvent =
  | {
      channel: "chat"
      type: "chat_privacy_updated"
      otherUserId: string
    }
  | {
      channel: "chat"
      type: "connection_ready"
      userId: string
      serverTime: string
    }
  | {
      channel: "chat"
      type: "message_created"
      otherUserId: string
      data: Record<string, unknown>
    }
  | {
      channel: "chat"
      type: "chat_updated"
      otherUserId: string
      data: Record<string, unknown>
    }
  | {
      channel: "chat"
      type: "typing"
      otherUserId: string
      isTyping: boolean
    }
  | {
      channel: "chat"
      type: "message_updated"
      otherUserId: string
      data: Record<string, unknown>
    }
  | {
      channel: "chat"
      type: "messages_read"
      otherUserId: string
      readAt: string
    }
  | {
      channel: "chat"
      type: "messages_delivered"
      otherUserId: string
      messageIds: string[]
      deliveredAt: string
    }
  | {
      channel: "chat"
      type: "message_deleted"
      otherUserId: string
      data: Record<string, unknown>
    }
  | {
      channel: "chat"
      type: "chat_cleared"
      otherUserId: string
      clearedAt: string
    }
  | {
      channel: "chat"
      type: "message_deleted"
      otherUserId: string
      messageId: string
      chatId: string
    }
  | {
      channel: "notifications"
      type: "connection_ready"
      userId: string
      serverTime: string
    }
  | {
      channel: "notifications"
      type: "notification_created"
      data: Record<string, unknown>
    }
  | {
      channel: "notifications"
      type: "notification_updated"
      notificationId: string
      data: Record<string, unknown>
    }
  | {
      channel: "notifications"
      type: "notifications_cleared"
      clearedAt: string
    }
  | {
      channel: "notifications"
      type: "notifications_refresh"
      refreshedAt: string
    }
  | {
      channel: "likes"
      type: "connection_ready"
      userId: string
      serverTime: string
    }
  | {
      channel: "likes"
      type: "likes_refresh"
      refreshedAt: string
    }
  | {
      channel: "matches"
      type: "connection_ready"
      userId: string
      serverTime: string
    }
  | {
      channel: "matches"
      type: "matches_refresh"
      refreshedAt: string
    }
  | {
      channel: "wallet"
      type: "connection_ready"
      userId: string
      serverTime: string
    }
  | {
      channel: "wallet"
      type: "wallet_transaction_created"
      data: Record<string, unknown>
    }
  | {
      channel: "wallet"
      type: "withdrawal_created"
      data: Record<string, unknown>
    }
  | {
      channel: "wallet"
      type: "withdrawal_updated"
      withdrawalId: string
      data: Record<string, unknown>
    }
  | {
      channel: "wallet"
      type: "wallet_refresh"
      refreshedAt: string
    }
  | {
      channel: "tip_requests"
      type: "connection_ready"
      userId: string
      serverTime: string
    }
  | {
      channel: "tip_requests"
      type: "tip_request_created"
      otherUserId: string
      data: Record<string, unknown>
    }
  | {
      channel: "tip_requests"
      type: "tip_request_updated"
      otherUserId: string
      data: Record<string, unknown>
    }
  | {
      channel: "tip_requests"
      type: "tip_requests_refresh"
      refreshedAt: string
    }
  | {
      channel: "profile"
      type: "connection_ready"
      userId: string
      serverTime: string
    }
  | {
      channel: "profile"
      type: "profile_updated"
      data: Record<string, unknown>
    }
  | {
      channel: "call"
      type: "call_ring"
      call: Record<string, unknown>
    }
  | {
      // Kept distinct from "call_ended" on purpose: clients dismiss the
      // CallKit call on an ending, and doing that on an answer tore the call
      // down the instant it was picked up.
      channel: "call"
      type: "call_answered" | "call_ended"
      inviteId: string
      bookingId: string
      status: string
    }

export type ChatRealtimeHub = {
  emitToUser: (userId: string, event: ChatRealtimeEvent) => void
  emitToUsers: (userIds: string[], event: ChatRealtimeEvent) => void
}

declare global {
  var __chatRealtimeHub: ChatRealtimeHub | undefined
}

function getHub() {
  return globalThis.__chatRealtimeHub
}

const chatDeliveryQueues = new Map<string, Promise<void>>()

export function emitChatRealtimeToUser(userId: string, event: ChatRealtimeEvent) {
  if (event.channel === "chat" && "otherUserId" in event) {
    const delivery = (chatDeliveryQueues.get(userId) ?? Promise.resolve()).then(async () => {
      const safe = await protectChatPayload(userId, event)
      getHub()?.emitToUser(userId, safe as ChatRealtimeEvent)
    }).catch((error) => {
      console.error("Chat identity lookup failed; event withheld", error instanceof Error ? error.name : "unknown")
    })
    chatDeliveryQueues.set(userId, delivery)
    void delivery.finally(() => {
      if (chatDeliveryQueues.get(userId) === delivery) chatDeliveryQueues.delete(userId)
    })
    return
  }
  getHub()?.emitToUser(userId, event)
}

export function emitChatRealtimeToUsers(userIds: string[], event: ChatRealtimeEvent) {
  for (const userId of userIds) emitChatRealtimeToUser(userId, event)
}
