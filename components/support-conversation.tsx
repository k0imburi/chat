"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { getTechnicalIssueAction, replyToTechnicalIssueAction, setTechnicalIssueTypingAction, updateTechnicalIssueStatusAction } from "@/lib/actions/technical-issues"
import { TechnicalIssueStatus } from "@prisma/client"
import { formatDateTime } from "@/lib/format"

type Issue = NonNullable<Awaited<ReturnType<typeof getTechnicalIssueAction>>>

export function SupportConversation({ initialIssue, backHref = "/technical-problems", backLabel = "Technical problems" }: { initialIssue: Issue; backHref?: string; backLabel?: string }) {
  const [issue, setIssue] = useState(initialIssue)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const lastInput = useRef(0)
  const lastHeartbeat = useRef(0)
  const typingQueue = useRef(Promise.resolve())

  function typing(active: boolean) {
    typingQueue.current = typingQueue.current.then(() => setTechnicalIssueTypingAction(initialIssue.id, active)).catch(() => {})
  }

  useEffect(() => {
    let mounted = true
    const timer = setInterval(() => {
      void getTechnicalIssueAction(initialIssue.id).then((next) => {
        if (mounted && next) { setIssue(next); setError("") }
      }).catch(() => { if (mounted) setError("Unable to refresh the conversation.") })
    }, 4000)
    return () => {
      mounted = false
      clearInterval(timer)
      typingQueue.current = typingQueue.current.then(() => setTechnicalIssueTypingAction(initialIssue.id, false)).catch(() => {})
    }
  }, [initialIssue.id])

  async function send() {
    if (busy || !message.trim()) return
    setBusy(true)
    setError("")
    try {
      typing(false)
      await typingQueue.current
      await replyToTechnicalIssueAction(issue.id, message)
      setMessage("")
      const next = await getTechnicalIssueAction(issue.id)
      if (next) setIssue(next)
    } catch { setError("Unable to send your reply. Please try again.") }
    finally { setBusy(false) }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm"><ArrowLeft size={16} />{backLabel}</Link>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="min-w-0"><h1 className="break-words text-xl font-semibold">{issue.subject}</h1><p className="text-sm text-muted-foreground">{issue.user.fullName}</p></div>
        <select aria-label="Ticket status" value={issue.status} disabled={busy} className="rounded border bg-background p-2 text-sm" onChange={async (event) => {
          const status = event.target.value as TechnicalIssueStatus
          setBusy(true)
          try { await updateTechnicalIssueStatusAction(issue.id, status); setIssue((current) => ({ ...current, status })) }
          catch { setError("Unable to update status.") }
          finally { setBusy(false) }
        }}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select>
      </header>
      <section aria-label="Conversation" className="divide-y">
        {[{ id: issue.id, message: issue.description, createdAt: issue.createdAt, fromAdmin: false }, ...issue.replies].map((reply) => (
          <article key={reply.id} className="space-y-2 py-4">
            <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{reply.fromAdmin ? "Support" : issue.user.fullName}</strong><time className="text-muted-foreground">{formatDateTime(reply.createdAt)}</time></div>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">{reply.message}</p>
          </article>
        ))}
      </section>
      <form className="space-y-3 border-t pt-4" onSubmit={(event) => { event.preventDefault(); void send() }}>
        <label htmlFor="support-reply" className="text-sm font-medium">Reply</label>
        <Textarea id="support-reply" value={message} maxLength={5000} rows={4} disabled={busy} onBlur={() => typing(false)} onChange={(event) => {
          setMessage(event.target.value)
          lastInput.current = Date.now()
          if (!event.target.value.trim()) { typing(false); lastHeartbeat.current = 0 }
          else if (lastInput.current - lastHeartbeat.current > 2000) { lastHeartbeat.current = lastInput.current; typing(true) }
        }} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || !message.trim()}><Send size={16} />{busy ? "Saving..." : "Send reply"}</Button>
      </form>
    </div>
  )
}
