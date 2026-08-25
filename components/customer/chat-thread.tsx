"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Lock, Reply, Send, SmilePlus, X } from "lucide-react"

export type ChatMessage = {
  id: string
  chatId: string
  senderId: string
  type: string
  textMsg: string
  imageUrl: string
  videoUrl: string
  thumbnailUrl: string
  replyToId: string
  replyToText: string
  replyToSenderId: string
  replyToSenderName: string
  reactions: Record<string, string[]>
  isRead: boolean
  locked?: boolean
  lockedContentType?: string
  unlockKind?: string
  sentAt: string
}

type ThreadState = {
  willChargeReply: boolean
  turnTakingRequired: boolean
  cycleState: string
  viewerIsInitiator: boolean
  unlockExpiresAt: string | null
}

const FIRST_REPLY_MINIMUM_CHARACTERS = 100
const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🙏"]

/** Mirrors the app's MessageController.isWaitingForReply. */
function computeWaitingForReply(state: ThreadState, messages: ChatMessage[], viewerId: string) {
  if (state.cycleState === "awaiting_icebreaker") return !state.viewerIsInitiator
  if (!state.turnTakingRequired) return false
  const latest = messages.find((m) => m.type !== "TIP")
  return latest?.senderId === viewerId
}

/** Mirrors isConversationLocked: the latest conversational message is a
 * locked reply from the OTHER person. */
function computeConversationLocked(messages: ChatMessage[], viewerId: string) {
  const latest = messages.find((m) => m.type !== "TIP")
  return Boolean(latest && latest.senderId !== viewerId && latest.locked)
}

/** Mirrors isAwaitingUnlock via cycleState, not the message's own locked
 * flag — that flag means "hidden FROM the viewer", so a creator looking at
 * their own locked reply would never see it as locked under that check. */
function computeAwaitingUnlock(state: ThreadState) {
  return state.cycleState === "awaiting_unlock" && !state.viewerIsInitiator
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Renders a locked reply the same way the app does: a genuinely blurred
 * preview, not a generic skeleton. The server only ever sends a short
 * preview snippet for a locked message (see buildLockedPreview in
 * mobile-chats.ts) — the real text never reaches a client that isn't
 * entitled to it — so this tiles that snippet into a few lines and blurs
 * all but a short leading fragment, communicating "there is a substantial
 * reply here" without rendering or downloading the protected content
 * itself. Image/video locked messages get a blurred gradient placeholder
 * instead, with a play icon for video.
 */
function LockedMessagePreview({ message, mine }: { message: ChatMessage; mine: boolean }) {
  if (message.lockedContentType === "image" || message.lockedContentType === "video") {
    return (
      <div className="relative h-32 w-56 overflow-hidden rounded-lg bg-gradient-to-r from-neutral-600 via-neutral-400 to-neutral-600">
        <div className="absolute inset-0 bg-black/20" style={{ backdropFilter: "blur(12px)" }} />
        {message.lockedContentType === "video" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40">
              <div className="ml-0.5 h-0 w-0 border-y-8 border-l-[14px] border-y-transparent border-l-white/70" />
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const visibleSnippet = (message.textMsg || "").replace(/[.…]+$/, "").trim()
  const visiblePrefix = visibleSnippet.length <= 18 ? visibleSnippet : visibleSnippet.slice(0, 18).trimEnd()
  const blurredBody = Array(6).fill(visiblePrefix || "···").join(" ")
  const textColor = mine ? "text-white/78" : "text-black/78 dark:text-white/78"
  const lineBg = mine ? "bg-white/15" : "bg-black/15 dark:bg-white/15"

  return (
    <div className="h-[88px] w-52 overflow-hidden">
      <div className="flex items-baseline gap-1">
        <span className={`whitespace-nowrap text-[13px] font-bold ${textColor}`}>{visiblePrefix}</span>
        <span
          className={`flex-1 truncate rounded text-[13px] ${textColor} ${lineBg}`}
          style={{ filter: "blur(3px)" }}
        >
          {blurredBody}
        </span>
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`mt-1.5 truncate rounded text-[13px] leading-[16px] ${textColor} ${lineBg}`}
          style={{ filter: "blur(3px)" }}
        >
          {blurredBody}
        </div>
      ))}
    </div>
  )
}

export function ChatThread({
  viewerId,
  otherUserId,
  otherName,
  otherAvatarUrl,
  initialMessages,
  initialState,
  broadcastOnly,
}: {
  viewerId: string
  otherUserId: string
  otherName: string
  otherAvatarUrl: string | null
  initialMessages: ChatMessage[]
  initialState: ThreadState
  broadcastOnly: boolean
}) {
  // Newest-first, matching the server's own fetch order (see getMessages).
  const [messages, setMessages] = useState(initialMessages)
  const [state, setState] = useState(initialState)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [insufficientBalance, setInsufficientBalance] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [reactingTo, setReactingTo] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const isConversationLocked = computeConversationLocked(messages, viewerId)
  const isAwaitingUnlock = computeAwaitingUnlock(state)
  const isWaitingForReply = computeWaitingForReply(state, messages, viewerId)
  const composerDisabled = isConversationLocked || isWaitingForReply
  const needsFirstReplyMinimum = state.willChargeReply && !isConversationLocked
  const draftLength = text.trim().length
  const belowFirstReplyMinimum = needsFirstReplyMinimum && draftLength < FIRST_REPLY_MINIMUM_CHARACTERS

  // ── Realtime ──────────────────────────────────────────────────
  // Reuses the same /ws/mobile hub the app connects to. The browser cannot
  // send the app's Authorization header on a WebSocket upgrade, so a
  // short-lived token is minted from the cookie session instead (see
  // signRealtimeToken) and passed as a query param, which server.mjs already
  // accepts as a token source.
  const refreshMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/customer/chats/${encodeURIComponent(otherUserId)}/messages`)
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data.data)) setMessages(data.data)
      setState({
        willChargeReply: Boolean(data.willChargeReply),
        turnTakingRequired: Boolean(data.turnTakingRequired),
        cycleState: data.cycleState ?? "awaiting_icebreaker",
        viewerIsInitiator: Boolean(data.viewerIsInitiator),
        unlockExpiresAt: data.unlockExpiresAt ?? null,
      })
    } catch {
      // Next realtime event or manual reload will retry.
    }
  }, [otherUserId])

  useEffect(() => {
    if (broadcastOnly) return
    let cancelled = false
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let refreshTimer: ReturnType<typeof setTimeout> | null = null

    async function connect() {
      // Close out any previous socket first. Without this, the periodic
      // token refresh below opened a SECOND connection every 90 minutes on
      // top of the first rather than replacing it — the old one's onclose
      // would then also fire its own reconnect, compounding into more
      // duplicate sockets over a long-lived tab.
      if (socket) {
        socket.onclose = null
        socket.close()
      }
      try {
        const res = await fetch("/api/customer/realtime-token")
        if (!res.ok || cancelled) return
        const { token } = await res.json()
        if (cancelled) return

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
        socket = new WebSocket(`${protocol}//${window.location.host}/ws/mobile?token=${encodeURIComponent(token)}`)
        wsRef.current = socket

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data)
            if (payload?.channel !== "chat") return
            if (payload.otherUserId && payload.otherUserId !== otherUserId) return
            if (
              payload.type === "message_created" ||
              payload.type === "message_updated" ||
              payload.type === "messages_read"
            ) {
              refreshMessages()
            }
          } catch {
            // Ignore malformed frames.
          }
        }

        socket.onclose = () => {
          if (cancelled) return
          // 2h token lifetime is far longer than any realistic tab session,
          // so a close here means the network dropped, not that the token
          // expired — reconnect rather than re-minting immediately.
          reconnectTimer = setTimeout(connect, 3000)
        }
      } catch {
        if (!cancelled) reconnectTimer = setTimeout(connect, 5000)
      }
    }

    connect()
    // Re-mint the token well inside its 2h window for a tab left open long.
    refreshTimer = setInterval(connect, 90 * 60 * 1000)

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (refreshTimer) clearInterval(refreshTimer)
      socket?.close()
      wsRef.current = null
    }
  }, [otherUserId, broadcastOnly, refreshMessages])

  // ── Sending ───────────────────────────────────────────────────
  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (sending || composerDisabled) return
    if (belowFirstReplyMinimum) return
    const body = text.trim()
    if (!body && !imageFile) return

    setSending(true)
    setError(null)
    setInsufficientBalance(false)
    const pendingReply = replyTo
    const pendingImage = imageFile
    setText("")
    setImageFile(null)
    setReplyTo(null)

    try {
      let imageObjectKey: string | undefined
      if (pendingImage) {
        const form = new FormData()
        form.set("image", pendingImage)
        const uploadRes = await fetch("/api/customer/chats/upload", { method: "POST", body: form })
        const uploadData = await uploadRes.json()
        if (!uploadRes.ok) throw new Error(uploadData.message || "Could not upload the image")
        imageObjectKey = uploadData.imageObjectKey
      }

      const res = await fetch(`/api/customer/chats/${encodeURIComponent(otherUserId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          textMsg: body,
          textLength: body.length,
          imageObjectKey,
          replyToId: pendingReply?.id,
          replyToText: pendingReply ? (pendingReply.textMsg || (pendingReply.imageUrl ? "Photo" : "")) : undefined,
          replyToSenderId: pendingReply?.senderId,
          replyToSenderName: pendingReply ? (pendingReply.senderId === viewerId ? "You" : otherName) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Failed to send message")
      // Optimistic-enough: refetch rather than splice the raw response in,
      // since sending can also flip cycleState/willChargeReply (e.g. the
      // icebreaker-to-locked-reply transition), and re-deriving all of that
      // client-side would just be a second copy of what getMessages already
      // computes correctly.
      await refreshMessages()
    } catch (err) {
      setText(body)
      setImageFile(pendingImage)
      setReplyTo(pendingReply)
      setError(err instanceof Error ? err.message : "Failed to send message")
    } finally {
      setSending(false)
    }
  }

  async function unlock(message: ChatMessage) {
    setError(null)
    setInsufficientBalance(false)
    try {
      const res = await fetch(
        `/api/customer/chats/${encodeURIComponent(otherUserId)}/messages/${encodeURIComponent(message.id)}/unlock`,
        { method: "POST" },
      )
      const data = await res.json()
      if (!res.ok) {
        // Same code the app's client checks for — the route returns 402 +
        // this code specifically so a client can distinguish "you're out of
        // Keys/ChatCredits" from any other failure and offer the fix, rather
        // than just reporting the error text.
        if (data.code === "INSUFFICIENT_BALANCE") {
          setInsufficientBalance(true)
          return
        }
        throw new Error(data.message || "Could not unlock this reply")
      }
      await refreshMessages()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock this reply")
    }
  }

  async function react(message: ChatMessage, emoji: string) {
    setReactingTo(null)
    const mine = new Set(message.reactions[emoji] ?? [])
    const hadIt = mine.has(viewerId)
    // Optimistic toggle, reconciled by the server's message_updated broadcast
    // (or, for the sender's own tab, the direct response below).
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== message.id) return m
        const next = { ...m.reactions }
        const users = new Set(next[emoji] ?? [])
        if (hadIt) users.delete(viewerId)
        else users.add(viewerId)
        if (users.size) next[emoji] = Array.from(users)
        else delete next[emoji]
        return { ...m, reactions: next }
      }),
    )
    try {
      const res = await fetch(
        `/api/customer/chats/${encodeURIComponent(otherUserId)}/messages/${encodeURIComponent(message.id)}/react`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        },
      )
      if (!res.ok) throw new Error("failed")
      const { data } = await res.json()
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, reactions: data.reactions } : m)))
    } catch {
      await refreshMessages()
    }
  }

  const chronological = useMemo(() => [...messages].reverse(), [messages])

  const composerHint = isConversationLocked
    ? `Unlock ${otherName}'s reply to continue with the conversation.`
    : isAwaitingUnlock
      ? "Wait for the conversation to be unlocked."
      : isWaitingForReply
        ? state.cycleState === "awaiting_icebreaker"
          ? `${otherName} hasn't started this conversation yet. You can reply once they message you.`
          : `It's ${otherName}'s turn. You can send another message once they reply.`
        : null

  return (
    <section className="flex h-[calc(100dvh-140px)] flex-col overflow-hidden rounded-3xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5 sm:h-[70dvh]">
      <div className="flex items-center gap-3 border-b border-black/10 p-4 dark:border-white/10">
        <Link href="/inbox" className="rounded-full border border-black/20 px-3 py-1.5 text-xs font-bold text-black/80 dark:border-white/20 dark:text-white/80">
          Back
        </Link>
        <div className="relative h-11 w-11 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          {otherAvatarUrl ? <Image src={otherAvatarUrl} alt="" fill sizes="44px" className="object-cover" /> : null}
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-black">{otherName || "ChatAndTip"}</h1>
          <p className="truncate text-xs text-black/50 dark:text-white/50">
            {broadcastOnly ? "Broadcast-only thread" : "Conversation"}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-black/[0.03] p-4 dark:bg-black/30">
        {chronological.map((message) => {
          const mine = message.senderId === viewerId
          const reactionEntries = Object.entries(message.reactions).filter(([, users]) => users.length > 0)
          return (
            <div key={message.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`relative max-w-[82%] ${mine ? "items-end" : "items-start"} flex flex-col gap-1`}>
                {message.replyToId ? (
                  <div
                    className={`max-w-full truncate rounded-2xl px-3 py-1.5 text-xs ${
                      mine ? "self-end bg-emerald-900/20 text-emerald-100/70" : "self-start bg-black/5 text-black/50 dark:bg-white/10 dark:text-white/50"
                    }`}
                  >
                    <span className="font-bold">{message.replyToSenderName || "Reply"}:</span> {message.replyToText || "Message"}
                  </div>
                ) : null}
                <div className={`rounded-3xl px-4 py-3 text-sm ${mine ? "bg-[#25d366] text-white" : "bg-black/10 text-black dark:bg-white/10 dark:text-white"}`}>
                  {message.locked ? (
                    <div className="min-w-52">
                      <div className="mb-3 flex items-center gap-2 font-black">
                        <Lock className="h-4 w-4" /> Locked reply
                      </div>
                      <LockedMessagePreview message={message} mine={mine} />
                      <button
                        onClick={() => unlock(message)}
                        className="mt-4 rounded-full border border-black/20 bg-black/10 px-4 py-1.5 text-xs font-bold text-black hover:bg-black/20 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                      >
                        Unlock with {message.unlockKind === "KEY" ? "Key" : "ChatCredit"}
                      </button>
                    </div>
                  ) : message.imageUrl ? (
                    // A signed R2 URL rather than a static asset, same as the
                    // rest of this codebase's chat image rendering — not
                    // something next/image's optimizer can usefully cache.
                    <img src={message.imageUrl} alt="" className="max-h-80 rounded-2xl object-contain" />
                  ) : (
                    <p className="whitespace-pre-wrap leading-6">{message.textMsg || "Media message"}</p>
                  )}
                  <p className={`mt-2 text-[10px] ${mine ? "text-white/70" : "text-black/40 dark:text-white/40"}`}>
                    {timeLabel(message.sentAt)}
                  </p>
                </div>

                {reactionEntries.length > 0 ? (
                  <div className={`flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                    {reactionEntries.map(([emoji, users]) => (
                      <button
                        key={emoji}
                        onClick={() => react(message, emoji)}
                        className={`rounded-full border px-1.5 py-0.5 text-xs ${
                          users.includes(viewerId)
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5"
                        }`}
                      >
                        {emoji} {users.length}
                      </button>
                    ))}
                  </div>
                ) : null}

                {!message.locked && !broadcastOnly ? (
                  <div className="flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => setReactingTo(reactingTo === message.id ? null : message.id)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-black/40 dark:text-white/40"
                    >
                      <SmilePlus className="h-3.5 w-3.5" /> React
                    </button>
                    <button
                      onClick={() => setReplyTo(message)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-black/40 dark:text-white/40"
                    >
                      <Reply className="h-3.5 w-3.5" /> Reply
                    </button>
                  </div>
                ) : null}

                {reactingTo === message.id ? (
                  <div className={`flex gap-1 rounded-full border border-black/10 bg-white px-2 py-1 shadow-sm dark:border-white/10 dark:bg-neutral-900 ${mine ? "self-end" : "self-start"}`}>
                    {QUICK_REACTIONS.map((emoji) => (
                      <button key={emoji} onClick={() => react(message, emoji)} className="text-base">
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
        {!chronological.length ? (
          <p className="py-16 text-center text-sm text-black/50 dark:text-white/50">No messages yet.</p>
        ) : null}
      </div>

      {broadcastOnly ? (
        <div className="border-t border-black/10 bg-amber-950/40 p-4 text-sm font-medium text-amber-400 dark:border-white/10">
          Replies are not available for broadcast messages.
        </div>
      ) : (
        <>
          {composerHint ? (
            <div className="border-t border-black/10 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-700 dark:border-white/10 dark:text-amber-400">
              {composerHint}
            </div>
          ) : null}

          {replyTo ? (
            <div className="flex items-center gap-2 border-t border-black/10 bg-black/[0.03] px-4 py-2 dark:border-white/10 dark:bg-white/5">
              <Reply className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-black/60 dark:text-white/70">
                Replying to {replyTo.senderId === viewerId ? "yourself" : otherName}
              </p>
              <button onClick={() => setReplyTo(null)} className="shrink-0 text-black/40 dark:text-white/40" aria-label="Cancel reply">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {insufficientBalance ? (
            <div className="flex items-center justify-between gap-3 border-t border-black/10 bg-amber-500/10 px-4 py-2 dark:border-white/10">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                You&apos;re out of Keys and ChatCredits to unlock this reply.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href="/checkout"
                  className="rounded-full bg-amber-600 px-3 py-1 text-xs font-bold text-white"
                >
                  Top up
                </Link>
                <button
                  onClick={() => setInsufficientBalance(false)}
                  className="text-amber-700 dark:text-amber-400"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : error ? (
            <div className="border-t border-black/10 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-600 dark:border-white/10 dark:text-rose-400">
              {error}
            </div>
          ) : null}

          {imageFile ? (
            <div className="flex items-center gap-2 border-t border-black/10 bg-black/[0.03] px-4 py-2 dark:border-white/10 dark:bg-white/5">
              <span className="min-w-0 flex-1 truncate text-xs text-black/60 dark:text-white/60">{imageFile.name}</span>
              <button onClick={() => setImageFile(null)} className="text-black/40 dark:text-white/40" aria-label="Remove image">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <form onSubmit={handleSend} className="grid gap-2 border-t border-black/10 p-4 dark:border-white/10 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={composerDisabled}
                placeholder={
                  composerDisabled
                    ? "Message unavailable right now"
                    : replyTo
                      ? "Write a reply…"
                      : "Write a message…"
                }
                rows={1}
                className="min-h-12 w-full resize-none rounded-3xl border border-black/10 bg-white px-4 py-2.5 text-sm disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
              <div className="flex items-center justify-between">
                <label className="cursor-pointer text-xs font-semibold text-black/50 dark:text-white/50">
                  Attach image
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {needsFirstReplyMinimum ? (
                  <span className={`text-[11px] font-bold ${belowFirstReplyMinimum ? "text-amber-600" : "text-emerald-600"}`}>
                    {draftLength} / {FIRST_REPLY_MINIMUM_CHARACTERS} characters
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="submit"
              disabled={sending || composerDisabled || belowFirstReplyMinimum || (!text.trim() && !imageFile)}
              className="flex h-11 items-center gap-2 self-end rounded-full bg-[#25d366] px-6 text-sm font-bold text-white disabled:opacity-40"
            >
              <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send"}
            </button>
          </form>
        </>
      )}
    </section>
  )
}
