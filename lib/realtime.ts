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
      type: "messages_read"
      otherUserId: string
      readAt: string
    }
  | {
      channel: "chat"
      type: "chat_cleared"
      otherUserId: string
      clearedAt: string
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
