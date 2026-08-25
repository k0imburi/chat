"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Heart, MessageCircle, Reply, Send, X } from "lucide-react"

export type CommentAuthor = {
  id?: string
  name: string
  avatarUrl: string | null
  isByCurrentUser?: boolean
}

export type CommentItem = {
  id: string
  text: string
  createdAt: string
  author: CommentAuthor
  parentId?: string | null
  likes?: number
  isLiked?: boolean
  replyCount?: number
  replies?: CommentItem[]
}

type Props = {
  mediaId: string
  commentCount: number
  comments: CommentItem[]
  viewerAvatarUrl?: string | null
  viewerName?: string | null
  signedIn: boolean
  /** Trigger element is rendered by the parent; this component exposes open() */
  trigger?: (open: () => void) => React.ReactNode
}

function timeLabel(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function CommentSheet({
  mediaId,
  commentCount,
  comments: initialComments,
  viewerAvatarUrl,
  viewerName,
  signedIn,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState(initialComments)
  const [loading, setLoading] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [text, setText] = useState("")
  const [posting, setPosting] = useState(false)
  // The comment being replied to. Mirrors the app: one reply target at a
  // time, cleared on send, dismissible without sending.
  const [replyTarget, setReplyTarget] = useState<CommentItem | null>(null)
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set())
  const textRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  // Ref access lives in an effect keyed on `open`, not inside handleOpen
  // itself — handleOpen is invoked via trigger(handleOpen) from inside JSX,
  // and a function that touches a ref while it could still run during
  // render is exactly what react-hooks/refs flags, even though in practice
  // trigger() only ever wraps it in an onClick.
  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => textRef.current?.focus(), 300)
    return () => clearTimeout(id)
  }, [open])

  const handleOpen = async () => {
    setOpen(true)
    setLoading(true)
    try {
      const res = await fetch(`/api/comments?mediaId=${encodeURIComponent(mediaId)}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.comments)) {
          setComments(data.comments)
          setNextCursor(data.nextCursor ?? null)
        }
      }
    } catch {
      // Keep whatever comments were already loaded.
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/comments?mediaId=${encodeURIComponent(mediaId)}&cursor=${encodeURIComponent(nextCursor)}`,
      )
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.comments)) {
          setComments((prev) => [...prev, ...data.comments])
          setNextCursor(data.nextCursor ?? null)
        }
      }
    } catch {
      // Leave nextCursor as-is so a retry (scrolling back down) tries again.
    } finally {
      setLoadingMore(false)
    }
  }

  async function loadReplies(parent: CommentItem) {
    if (!parent.replyCount || (parent.replies && parent.replies.length > 0)) return
    setLoadingReplies((s) => new Set(s).add(parent.id))
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(parent.id)}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.replies)) {
          setComments((prev) =>
            prev.map((c) => (c.id === parent.id ? { ...c, replies: data.replies } : c)),
          )
        }
      }
    } catch {
      // Leave replies empty — "View N replies" stays tappable to retry.
    } finally {
      setLoadingReplies((s) => {
        const next = new Set(s)
        next.delete(parent.id)
        return next
      })
    }
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || posting) return
    setPosting(true)
    setText("")
    const parentId = replyTarget?.id
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, text: body, parentId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.comment) {
          if (parentId) {
            setComments((prev) =>
              prev.map((c) =>
                c.id === parentId
                  ? {
                      ...c,
                      replyCount: (c.replyCount ?? 0) + 1,
                      replies: [...(c.replies ?? []), data.comment],
                    }
                  : c,
              ),
            )
          } else {
            setComments((c) => [data.comment, ...c])
          }
        }
        setReplyTarget(null)
      } else {
        setText(body)
      }
    } catch {
      setText(body) // restore on error
    } finally {
      setPosting(false)
      textRef.current?.focus()
    }
  }

  function startReply(comment: CommentItem) {
    setReplyTarget(comment)
    textRef.current?.focus()
  }

  /** Finds a comment or one of its direct replies for an optimistic update. */
  function patchComment(
    commentId: string,
    parentId: string | undefined,
    patch: (c: CommentItem) => CommentItem,
  ) {
    setComments((prev) =>
      prev.map((c) => {
        if (parentId) {
          if (c.id !== parentId) return c
          return { ...c, replies: (c.replies ?? []).map((r) => (r.id === commentId ? patch(r) : r)) }
        }
        return c.id === commentId ? patch(c) : c
      }),
    )
  }

  async function toggleLike(comment: CommentItem, parentId?: string) {
    const wasLiked = Boolean(comment.isLiked)
    // Optimistic, then reconciled with the server count — same pattern as the
    // app, so a like feels instant instead of waiting on a round trip.
    patchComment(comment.id, parentId, (c) => ({
      ...c,
      isLiked: !wasLiked,
      likes: (c.likes ?? 0) + (wasLiked ? -1 : 1),
    }))
    try {
      const res = await fetch(`/api/comments/${encodeURIComponent(comment.id)}/like`, { method: "POST" })
      if (!res.ok) throw new Error("failed")
      const { data } = await res.json()
      patchComment(comment.id, parentId, (c) => ({ ...c, isLiked: data.liked, likes: data.likes }))
    } catch {
      patchComment(comment.id, parentId, (c) => ({
        ...c,
        isLiked: wasLiked,
        likes: (c.likes ?? 0) + (wasLiked ? 1 : -1),
      }))
    }
  }

  function renderComment(comment: CommentItem, depth: 0 | 1, parentId?: string) {
    return (
      <div key={comment.id} className={depth === 0 ? "flex gap-3" : "flex gap-2.5 pl-9"}>
        <div
          className={`relative shrink-0 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10 ${
            depth === 0 ? "h-9 w-9" : "h-7 w-7"
          }`}
        >
          {comment.author.avatarUrl ? (
            <Image src={comment.author.avatarUrl} alt="" fill sizes="36px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-500 dark:text-white/50">
              {(comment.author.name || "?")[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl bg-neutral-50 px-4 py-3 ring-1 ring-black/[0.04] dark:bg-white/[0.06] dark:ring-white/10">
            <div className="mb-0.5 flex items-baseline gap-2">
              <span className="truncate text-[13px] font-bold text-neutral-950 dark:text-white">
                {comment.author.name}
              </span>
              {comment.author.isByCurrentUser ? (
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  You
                </span>
              ) : null}
              <span className="ml-auto shrink-0 text-[11px] text-neutral-400 dark:text-white/40">
                {timeLabel(comment.createdAt)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700 dark:text-white/85">
              {comment.text}
            </p>
          </div>
          <div className="mt-1.5 flex items-center gap-4 pl-3">
            <button
              onClick={() => toggleLike(comment, parentId)}
              className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 dark:text-white/55"
            >
              <Heart
                className={`h-3.5 w-3.5 ${
                  comment.isLiked ? "fill-rose-500 text-rose-500" : ""
                }`}
              />
              {comment.likes ? comment.likes : "Like"}
            </button>
            <button
              onClick={() => startReply(depth === 0 ? comment : comments.find((c) => c.id === parentId) ?? comment)}
              className="text-xs font-semibold text-neutral-500 dark:text-white/55"
            >
              Reply
            </button>
            {depth === 0 && (comment.replyCount ?? 0) > 0 && !comment.replies?.length ? (
              <button
                onClick={() => loadReplies(comment)}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
              >
                {loadingReplies.has(comment.id)
                  ? "Loading…"
                  : `View ${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"}`}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {trigger ? (
        trigger(handleOpen)
      ) : (
        <button onClick={handleOpen} className="flex flex-col items-center gap-1" aria-label="Open comments">
          <div className="flex h-12 w-12 items-center justify-center">
            <MessageCircle className="h-[26px] w-[26px] text-white" />
          </div>
          <span className="text-xs font-bold text-white">{commentCount.toLocaleString()}</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      )}

      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-2xl bg-white transition-transform duration-300 ease-out dark:bg-neutral-950 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ willChange: "transform" }}
      >
        <div className="relative flex items-center justify-between border-b border-neutral-100 px-5 py-3 dark:border-white/10">
          <div className="absolute left-1/2 top-3 mx-auto h-1 w-10 -translate-x-1/2 rounded-full bg-neutral-300 dark:bg-white/20" />
          <p className="text-[15px] font-black text-neutral-950 dark:text-white">
            Comments
            {comments.length > 0 && (
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-500 dark:bg-white/10 dark:text-white/60">
                {comments.length}
              </span>
            )}
          </p>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-white/10 dark:text-white/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget
            // Same trigger the app uses: near the end of the scrollable
            // extent, not only once it is fully exhausted.
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) loadMore()
          }}
          className="flex-1 overflow-y-auto px-4 py-3"
          style={{ scrollbarWidth: "none" }}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-sm text-neutral-400 dark:text-white/40">Loading comments…</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <MessageCircle className="h-8 w-8 text-neutral-300 dark:text-white/15" />
              <p className="text-sm text-neutral-400 dark:text-white/40">No comments yet. Be the first!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((c) => (
                <div key={c.id} className="space-y-2.5">
                  {renderComment(c, 0)}
                  {(c.replies ?? []).map((r) => renderComment(r, 1, c.id))}
                </div>
              ))}
              {nextCursor ? (
                <div className="flex justify-center pb-2 pt-1">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="text-xs font-bold text-neutral-400 dark:text-white/40"
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {replyTarget ? (
          <div className="flex items-center gap-2 border-t border-neutral-100 bg-neutral-50 px-5 py-2.5 dark:border-white/10 dark:bg-white/5">
            <Reply className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-600 dark:text-white/70">
              Replying to {replyTarget.author.name}
            </p>
            <button
              onClick={() => setReplyTarget(null)}
              className="shrink-0 text-neutral-400 dark:text-white/40"
              aria-label="Cancel reply"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="border-t border-neutral-100 bg-white px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 dark:border-white/10 dark:bg-neutral-950">
          {signedIn ? (
            <form onSubmit={handlePost} className="flex items-end gap-3">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
                {viewerAvatarUrl ? (
                  <Image src={viewerAvatarUrl} alt="" fill sizes="36px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-500 dark:text-white/50">
                    {(viewerName || "?")[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-1 items-end gap-2">
                <textarea
                  ref={textRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handlePost(e)
                    }
                  }}
                  placeholder={replyTarget ? "Write a reply…" : "Add a comment…"}
                  rows={1}
                  className="min-h-[40px] max-h-24 flex-1 resize-none rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-950 placeholder:text-neutral-400 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || posting}
                  aria-label={replyTarget ? "Send reply" : "Post comment"}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition-opacity disabled:opacity-30"
                >
                  {replyTarget ? <Reply className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </form>
          ) : (
            <p className="py-2 text-center text-sm text-neutral-500 dark:text-white/50">
              <Link href="/login" className="font-bold text-neutral-950 dark:text-white">
                Sign in
              </Link>{" "}
              to comment
            </p>
          )}
        </div>
      </div>
    </>
  )
}
