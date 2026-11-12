export type AnonymousIdentity = { userId: string; alias: string };

// Only transport identifiers are rewritten. Message text remains user-authored.
const identityKeys = new Set(["senderId", "otherUserId", "chatUserId", "userId", "peerUserId", "replyToSenderId", "threadUserId", "requesterId", "recipientId", "pinnedById", "blockedId", "blockerId"]);

export function maskChatPayload(value: unknown, identities: AnonymousIdentity[], key = ""): unknown {
  const aliases = new Map(identities.map((identity) => [identity.userId, identity.alias]));
  if (typeof value === "string") return identityKeys.has(key) ? aliases.get(value) ?? value : value;
  if (Array.isArray(value)) return value.map((item) => maskChatPayload(item, identities, key));
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  const source = value as Record<string, unknown>;
  const profileAlias = typeof source.userId === "string" && aliases.get(source.userId);
  if (profileAlias && ("fullname" in source || "profileVideo" in source)) {
    return { userId: profileAlias, fullname: "Anonymous", username: "", profileAvatarUrl: "", profileVideo: {}, gallery: [], verified: 0, isAnonymous: true, showLastActivity: false, accountType: "individual" };
  }
  const result = Object.fromEntries(Object.entries(source).map(([field, item]) => [field, maskChatPayload(item, identities, field)]));
  if (aliases.has(String(source.replyToSenderId))) result.replyToSenderName = "Anonymous";
  if (key === "reactions") {
    for (const [emoji, ids] of Object.entries(source)) {
      if (Array.isArray(ids)) result[emoji] = ids.map((id) => aliases.get(String(id)) ?? id);
    }
  }
  return result;
}
