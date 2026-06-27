import "server-only"

export type ChatRealtimeEvent =
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
      channel: "call"
      type: "call_ended"
      channelId: string
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

export function emitChatRealtimeToUser(userId: string, event: ChatRealtimeEvent) {
  getHub()?.emitToUser(userId, event)
}

export function emitChatRealtimeToUsers(userIds: string[], event: ChatRealtimeEvent) {
  getHub()?.emitToUsers(userIds, event)
}
