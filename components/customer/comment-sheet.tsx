"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { MessageCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export type CommentAuthor = {
  name: string
  avatarUrl: string | null
}

export type CommentItem = {
  id: string
  text: string
  createdAt: string
  author: CommentAuthor
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
  const [text, setText] = useState("")
  const [posting, setPosting] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)

  // Lock body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || posting) return
    setPosting(true)
    const body = text.trim()
    setText("")
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, text: body }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.comment) setComments((c) => [data.comment, ...c])
      }
    } catch {
      setText(body) // restore on error
    } finally {
      setPosting(false)
    }
  }

  const handleOpen = async () => {
    setOpen(true)
    setTimeout(() => textRef.current?.focus(), 300)
    setLoading(true)
    try {
      const res = await fetch(`/api/comments?mediaId=${encodeURIComponent(mediaId)}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.comments)) setComments(data.comments)
      }
    } catch {
      // Keep whatever comments were already loaded.
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Trigger slot */}
      {trigger ? trigger(handleOpen) : (
        <button
          onClick={handleOpen}
          className="flex flex-col items-center gap-1"
          aria-label="Open comments"
        >
          <div className="flex h-12 w-12 items-center justify-center">
            <MessageCircle className="h-[26px] w-[26px] text-white" />
          </div>
          <span className="text-xs font-bold text-white">
            {commentCount.toLocaleString()}
          </span>
        </button>
      )}

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sheet — slides up from bottom */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-2xl bg-white transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ willChange: "transform" }}
      >
        {/* Handle + header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-neutral-300 absolute left-1/2 -translate-x-1/2 top-3" />
          <p className="text-[15px] font-black text-neutral-950">
            Comments{comments.length > 0 && (
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-500">
                {comments.length}
              </span>
            )}
          </p>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable comment list */}
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "none" }}>
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-sm text-neutral-400">Loading comments…</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <MessageCircle className="h-8 w-8 text-neutral-300" />
              <p className="text-sm text-neutral-400">No comments yet. Be the first!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-200">
                    {c.author.avatarUrl ? (
                      <Image src={c.author.avatarUrl} alt="" fill sizes="36px" className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-500">
                        {(c.author.name || "?")[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 rounded-2xl bg-neutral-50 px-4 py-3 ring-1 ring-black/[0.04]">
                    <div className="mb-0.5 flex items-baseline gap-2">
                      <span className="text-[13px] font-bold text-neutral-950">{c.author.name}</span>
                      <span className="text-[11px] text-neutral-400">
                        {new Date(c.createdAt).toLocaleString("en-KE", {
                          timeZone: "Africa/Nairobi",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Compose — sticks at bottom */}
        <div className="border-t border-neutral-100 bg-white px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
          {signedIn ? (
            <form onSubmit={handlePost} className="flex items-end gap-3">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-200">
                {viewerAvatarUrl ? (
                  <Image src={viewerAvatarUrl} alt="" fill sizes="36px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-500">
                    {(viewerName || "?")[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-1 gap-2">
                <Textarea
                  ref={textRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Add a comment…"
                  rows={1}
                  className="min-h-[40px] flex-1 resize-none rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-950 placeholder:text-neutral-400 focus:outline-none"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!text.trim() || posting}
                  className="h-10 self-end rounded-full px-4 text-xs font-bold"
                >
                  Post
                </Button>
              </div>
            </form>
          ) : (
            <p className="py-2 text-center text-sm text-neutral-500">
              <Link href="/login" className="font-bold text-neutral-950">Sign in</Link> to comment
            </p>
          )}
        </div>
      </div>
    </>
  )
}
