"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Archive, ArrowLeft, Check, CheckCheck, ChevronDown, ImagePlus, Lock, MoreHorizontal, MoreVertical, Pin, Reply, Search, Send, Share2, ShieldCheck, SmilePlus, Trash2, X } from "lucide-react"
import { chatSystemText } from "@/lib/chat-system-text"

export type ChatMessage = {
  id: string
  chatId: string
  senderId: string
  type: string
  textMsg: string
  imageUrl: string
  videoUrl: string
  thumbnailUrl: string
  documentUrl?: string
  documentName?: string
  documentMimeType?: string
  replyToId: string
  replyToText: string
  replyToSenderId: string
  replyToSenderName: string
  reactions: Record<string, string[]>
  isRead: boolean
  deliveredAt?: string | null
  pinnedAt?: string | null
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
  hiddenCodeGroupId,
  hiddenForAll = false,
}: {
  viewerId: string
  otherUserId: string
  otherName: string
  otherAvatarUrl: string | null
  initialMessages: ChatMessage[]
  initialState: ThreadState
  broadcastOnly: boolean
  hiddenCodeGroupId?: string
  hiddenForAll?: boolean
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
  const [actionMessageId, setActionMessageId] = useState<string | null>(null)
  const [otherTyping, setOtherTyping] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [vaultMessage, setVaultMessage] = useState<ChatMessage | null>(null)
  const [vaultCode, setVaultCode] = useState("")
  const [privacyAction, setPrivacyAction] = useState<"hide_for_me" | "hide_for_all" | "unhide_for_me" | "unhide_for_all" | null>(null)
  const [privacyCode, setPrivacyCode] = useState("")
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const messageScrollerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

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
      const suffix = hiddenCodeGroupId ? `?hiddenCodeGroupId=${encodeURIComponent(hiddenCodeGroupId)}` : ""
      const res = await fetch(`/api/customer/chats/${encodeURIComponent(otherUserId)}/messages${suffix}`)
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
  }, [otherUserId, hiddenCodeGroupId])

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
            if (payload.type === "typing") setOtherTyping(Boolean(payload.isTyping))
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
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
  }, [otherUserId, broadcastOnly, refreshMessages])

  function announceTyping(value: string) {
    if (broadcastOnly || composerDisabled || wsRef.current?.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: "typing", otherUserId, isTyping: value.trim().length > 0 }))
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    if (value.trim().length > 0) {
      typingTimerRef.current = setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "typing", otherUserId, isTyping: false }))
      }, 2200)
    }
  }

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
      let videoObjectKey: string | undefined
      let documentObjectKey: string | undefined
      if (pendingImage) {
        const form = new FormData()
        form.set("image", pendingImage)
        const uploadRes = await fetch("/api/customer/chats/upload", { method: "POST", body: form })
        const uploadData = await uploadRes.json()
        if (!uploadRes.ok) throw new Error(uploadData.message || "Could not upload the image")
        imageObjectKey = uploadData.imageObjectKey
        videoObjectKey = uploadData.videoObjectKey
        documentObjectKey = uploadData.documentObjectKey
      }

      const res = await fetch(`/api/customer/chats/${encodeURIComponent(otherUserId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          textMsg: body,
          textLength: body.length,
          imageObjectKey,
          videoObjectKey,
          documentObjectKey,
          documentName: pendingImage?.name,
          documentMimeType: pendingImage?.type,
          documentSizeBytes: pendingImage?.size,
          replyToId: pendingReply?.id,
          replyToText: pendingReply ? (pendingReply.textMsg || (pendingReply.imageUrl ? "Photo" : "")) : undefined,
          replyToSenderId: pendingReply?.senderId,
          replyToSenderName: pendingReply ? (pendingReply.senderId === viewerId ? "You" : otherName) : undefined,
          hiddenCodeGroupId,
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

  async function pinMessage(message: ChatMessage) {
    try {
      const response = await fetch(`/api/mobile/chats/${encodeURIComponent(otherUserId)}/messages/${encodeURIComponent(message.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: !message.pinnedAt }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Could not update pin")
      await refreshMessages()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update pin") }
  }

  async function deleteOne(message: ChatMessage) {
    try {
      const response = await fetch(`/api/mobile/chats/${encodeURIComponent(otherUserId)}/messages/${encodeURIComponent(message.id)}?scope=me`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Could not delete message")
      await refreshMessages()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete message") }
  }

  function shareMessage(message: ChatMessage) {
    const text = message.textMsg || message.documentName || "Shared from ChatAndTip"
    const url = message.imageUrl || message.videoUrl || message.documentUrl || undefined
    if (navigator.share) void navigator.share({ text, url }).catch(() => {})
    else void navigator.clipboard?.writeText([text, url].filter(Boolean).join("\n"))
  }

  async function moveToVault() {
    if (!vaultMessage || vaultCode.length !== 4) return
    try {
      const response = await fetch("/api/mobile/secure-folder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherUserId, messageIds: [vaultMessage.id], code: vaultCode, confirmCode: vaultCode }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Could not move message to Vault")
      setVaultMessage(null); setVaultCode(""); await refreshMessages()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not move message to Vault") }
  }

  async function updatePrivacy() {
    if (!privacyAction) return
    const hiding = privacyAction === "hide_for_me" || privacyAction === "hide_for_all"
    if (hiding && privacyCode.length !== 4) return
    try {
      const response = await fetch(`/api/mobile/chats/${encodeURIComponent(otherUserId)}/hide`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: privacyAction, ...(hiding ? { code: privacyCode } : {}) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Could not hide conversation")
      window.location.href = "/inbox"
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not hide conversation") }
  }

  const chronological = useMemo(() => [...messages].reverse(), [messages])
  const visibleMessages = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    return needle ? chronological.filter((message) => `${message.textMsg} ${message.documentName ?? ""}`.toLowerCase().includes(needle)) : chronological
  }, [chronological, searchQuery])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
    setShowScrollToBottom(false)
  }, [chronological.length])

  function handleMessageScroll() {
    const scroller = messageScrollerRef.current
    if (!scroller) return
    setShowScrollToBottom(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 96)
  }

  function scrollToLatestMessage() {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    setShowScrollToBottom(false)
  }

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
    <section className="flex h-[calc(100dvh-140px)] flex-col overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-[#101312] sm:h-[78dvh]">
      <div className="flex items-center gap-3 border-b border-black/10 bg-white/90 p-3 backdrop-blur-xl dark:border-white/10 dark:bg-[#101312]/90">
        <Link href="/inbox" aria-label="Back to chats" className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="relative h-11 w-11 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          {otherAvatarUrl ? <Image src={otherAvatarUrl} alt="" fill sizes="44px" className="object-cover" /> : null}
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-black">{otherName || "ChatAndTip"}</h1>
          <p className="truncate text-xs text-black/50 dark:text-white/50">
            {broadcastOnly ? "Broadcast-only thread" : otherTyping ? "Typing…" : "Conversation"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => { setSearchOpen((value) => !value); setMenuOpen(false) }} aria-label="Search messages" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><Search className="h-5 w-5" /></button>
          <div className="relative"><button onClick={() => setMenuOpen((value) => !value)} aria-label="Conversation options" className="grid h-10 w-10 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><MoreVertical className="h-5 w-5" /></button>{menuOpen ? <div className="absolute right-0 top-11 z-30 w-56 rounded-2xl border border-black/10 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#202c33]">{hiddenCodeGroupId ? <button onClick={() => { setPrivacyAction(hiddenForAll ? "unhide_for_all" : "unhide_for_me"); setMenuOpen(false) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"><ShieldCheck className="h-4 w-4" /> {hiddenForAll ? "Request unhide for both" : "Unhide for me"}</button> : <><button onClick={() => { setPrivacyAction("hide_for_me"); setMenuOpen(false) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"><ShieldCheck className="h-4 w-4" /> Hide for me</button><button onClick={() => { setPrivacyAction("hide_for_all"); setMenuOpen(false) }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"><ShieldCheck className="h-4 w-4" /> Hide for both</button></>}</div> : null}</div>
        </div>
      </div>

      {searchOpen ? <div className="flex items-center gap-2 border-b border-black/10 bg-white px-4 py-2 dark:border-white/10 dark:bg-[#101312]"><Search className="h-4 w-4 text-black/35 dark:text-white/35" /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search this conversation" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" /><button onClick={() => { setSearchOpen(false); setSearchQuery("") }} aria-label="Close search"><X className="h-4 w-4" /></button></div> : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
      <div ref={messageScrollerRef} onScroll={handleMessageScroll} className="h-full space-y-3 overflow-y-auto bg-[#efeae2] bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,.72),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(37,211,102,.06),transparent_30%)] p-4 dark:bg-[#0b141a] dark:bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,.035),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(37,211,102,.04),transparent_30%)]">
        {visibleMessages.map((message) => {
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
                {message.pinnedAt ? <span className={`flex items-center gap-1 text-[10px] font-bold text-[#15984c] ${mine ? "self-end" : "self-start"}`}><Pin className="h-3 w-3 fill-current" /> Pinned</span> : null}
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${mine ? "rounded-br-md bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-white" : "rounded-bl-md bg-white text-[#111b21] dark:bg-[#202c33] dark:text-white"}`}>
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
                  ) : message.videoUrl ? (
                    <video src={message.videoUrl} controls playsInline className="max-h-80 rounded-2xl" />
                  ) : message.documentUrl || message.documentMimeType ? (
                    message.documentMimeType?.startsWith("audio/") ? <audio src={message.documentUrl} controls className="max-w-full" /> : <p className="font-semibold">{message.documentName || "Attachment"}</p>
                  ) : (
                    <p className="whitespace-pre-wrap leading-6">{chatSystemText(message.textMsg || "Media message", mine)}</p>
                  )}
                  <div className={`mt-1.5 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-black/45 dark:text-white/55" : "text-black/40 dark:text-white/40"}`}>
                    <span>{timeLabel(message.sentAt)}</span>
                    {mine ? message.isRead ? <CheckCheck className="h-4 w-4 text-sky-500" aria-label="Read" /> : message.deliveredAt ? <CheckCheck className="h-4 w-4" aria-label="Delivered" /> : <Check className="h-3.5 w-3.5" aria-label="Sent" /> : null}
                  </div>
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
                  <><button type="button" onClick={() => setActionMessageId(actionMessageId === message.id ? null : message.id)} aria-label="Message actions" className={`grid h-7 w-7 place-items-center rounded-full text-black/35 transition hover:bg-black/5 hover:text-black/60 dark:text-white/35 dark:hover:bg-white/10 dark:hover:text-white/70 ${mine ? "self-end" : "self-start"}`}><MoreHorizontal className="h-4 w-4" /></button><div className={`flex max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white/80 px-2 py-1.5 shadow-sm backdrop-blur dark:bg-[#202c33]/90 ${actionMessageId === message.id ? "flex" : "hidden group-hover:flex"}`}>
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
                    <button onClick={() => void pinMessage(message)} className="flex items-center gap-1 text-[11px] font-semibold text-black/40 dark:text-white/40"><Pin className="h-3.5 w-3.5" /> {message.pinnedAt ? "Unpin" : "Pin"}</button>
                    <button onClick={() => shareMessage(message)} className="flex items-center gap-1 text-[11px] font-semibold text-black/40 dark:text-white/40"><Share2 className="h-3.5 w-3.5" /> Share</button>
                    <button onClick={() => setVaultMessage(message)} className="flex items-center gap-1 text-[11px] font-semibold text-black/40 dark:text-white/40"><Archive className="h-3.5 w-3.5" /> Vault</button>
                    <button onClick={() => void deleteOne(message)} className="flex items-center gap-1 text-[11px] font-semibold text-rose-500/70"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div></>
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
        <div ref={endRef} />
      </div>
      {showScrollToBottom ? <button type="button" onClick={scrollToLatestMessage} aria-label="Scroll to latest message" className="absolute bottom-4 right-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-black/10 bg-[#25d366] text-white shadow-lg shadow-black/20 transition hover:scale-105 active:scale-95 dark:border-white/10"><ChevronDown className="h-6 w-6" strokeWidth={2.5}/></button> : null}
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

          <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-black/10 bg-white p-3 dark:border-white/10 dark:bg-[#101312]">
            <button type="button" onClick={() => imageInputRef.current?.click()} disabled={composerDisabled} aria-label="Attach media" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/5 text-black/55 transition hover:bg-black/10 disabled:opacity-40 dark:bg-white/10 dark:text-white/60"><ImagePlus className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1 space-y-1.5">
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); announceTyping(e.target.value) }}
                disabled={composerDisabled}
                placeholder={
                  composerDisabled
                    ? "Message unavailable right now"
                    : replyTo
                      ? "Write a reply…"
                      : "Write a message…"
                }
                rows={1}
                className="min-h-11 w-full resize-none rounded-3xl border-0 bg-black/[0.055] px-4 py-3 text-sm outline-none ring-[#25d366]/40 focus:ring-2 disabled:opacity-50 dark:bg-white/[0.08] dark:text-white"
              />
              <div className="flex items-center justify-between">
                <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/*,application/pdf" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
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
              aria-label="Send message"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#25d366] text-white shadow-md shadow-emerald-500/20 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </>
      )}
      {vaultMessage ? <CodeDialog title="Move message to Vault" description="Create or enter the 4-digit code used to find this message in Vault." code={vaultCode} setCode={setVaultCode} confirmLabel="Move to Vault" onCancel={() => { setVaultMessage(null); setVaultCode("") }} onConfirm={() => void moveToVault()} /> : null}
      {privacyAction ? privacyAction.startsWith("unhide") ? <ConfirmDialog title={privacyAction === "unhide_for_all" ? "Unhide chat for both?" : "Unhide this chat?"} description={privacyAction === "unhide_for_all" ? "The other person must accept before the conversation becomes visible for both of you." : "This conversation will return to your normal chat list."} confirmLabel={privacyAction === "unhide_for_all" ? "Send request" : "Unhide"} onCancel={() => setPrivacyAction(null)} onConfirm={() => void updatePrivacy()} /> : <CodeDialog title={privacyAction === "hide_for_all" ? "Hide chat for both" : "Hide chat for me"} description={privacyAction === "hide_for_all" ? "The chat hides for you now and the other person receives a consent request." : "Enter a code to move this conversation to Hidden Chats."} code={privacyCode} setCode={setPrivacyCode} confirmLabel="Hide conversation" onCancel={() => { setPrivacyAction(null); setPrivacyCode("") }} onConfirm={() => void updatePrivacy()} /> : null}
    </section>
  )
}

function ConfirmDialog({ title, description, confirmLabel, onCancel, onConfirm }: { title: string; description: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4"><div className="w-full max-w-sm rounded-[24px] bg-white p-5 text-black shadow-2xl dark:bg-[#202c33] dark:text-white"><h2 className="text-lg font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">{description}</p><div className="mt-5 flex gap-2"><button onClick={onCancel} className="h-11 flex-1 rounded-xl bg-black/5 text-sm font-bold dark:bg-white/10">Cancel</button><button onClick={onConfirm} className="h-11 flex-1 rounded-xl bg-[#25d366] text-sm font-bold text-white">{confirmLabel}</button></div></div></div>
}

function CodeDialog({ title, description, code, setCode, confirmLabel, onCancel, onConfirm }: { title: string; description: string; code: string; setCode: (value: string) => void; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4"><div className="w-full max-w-sm rounded-[24px] bg-white p-5 text-black shadow-2xl dark:bg-[#202c33] dark:text-white"><h2 className="text-lg font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">{description}</p><input autoFocus inputMode="numeric" maxLength={4} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="mt-5 h-13 w-full rounded-2xl bg-black/5 text-center text-xl font-black tracking-[0.65em] outline-none ring-[#25d366]/40 focus:ring-2 dark:bg-white/10" placeholder="••••" /><div className="mt-5 flex gap-2"><button onClick={onCancel} className="h-11 flex-1 rounded-xl bg-black/5 text-sm font-bold dark:bg-white/10">Cancel</button><button onClick={onConfirm} disabled={code.length !== 4} className="h-11 flex-1 rounded-xl bg-[#25d366] text-sm font-bold text-white disabled:opacity-40">{confirmLabel}</button></div></div></div>
}
