"use client"

import { useId, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { FlaskConical, Loader2, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { startTestAdAction, stopTestAdAction } from "@/lib/actions/ad-review"

export function AdTestControls({ campaignId, campaignName, isTest, active }: {
  campaignId: string
  campaignName: string
  isTest: boolean
  active: boolean
}) {
  const router = useRouter()
  const id = useId()
  const busy = useRef(false)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usernames, setUsernames] = useState("")
  const [allUsers, setAllUsers] = useState(true)
  const [hours, setHours] = useState("720")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    setError(null)
    const testerUsernames = [...new Set(usernames.split(",").map((name) => name.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))]
    const durationHours = Number(hours)
    if (!isTest && ((!allUsers && (!testerUsernames.length || testerUsernames.length > 10 || testerUsernames.some((name) => name.length > 191))) || !Number.isInteger(durationHours) || durationHours < 1 || durationHours > 720)) {
      setError("Choose all active users or enter 1–10 usernames, and set a whole-number duration up to 720 hours.")
      return
    }
    busy.current = true
    setPending(true)
    try {
      if (isTest) await stopTestAdAction(campaignId)
      else await startTestAdAction({ campaignId, testerUsernames, allUsers, durationHours })
      setOpen(false)
      setUsernames("")
      setAllUsers(true)
      setHours("720")
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The test action failed. Please try again.")
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  if (isTest && !active) return null

  return <Dialog open={open} onOpenChange={(next) => {
    if (busy.current) return
    setOpen(next)
    setError(null)
  }}>
    <DialogTrigger asChild>
      <Button type="button" size="sm" variant="outline">
        {isTest ? <Square className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
        {isTest ? "Stop test" : "Approve & Run as Test"}
      </Button>
    </DialogTrigger>
    <DialogContent className="sm:w-[480px]" hideCloseButton={pending}>
      <DialogHeader>
        <DialogTitle>{isTest ? "Stop test ad?" : "Approve & Run as Test"}</DialogTitle>
        <DialogDescription className="break-words">{campaignName}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form id={id} onSubmit={submit} className="space-y-4" aria-busy={pending}>
          {isTest ? <p className="text-sm">Stop test delivery for this campaign?</p> : <>
            <label htmlFor={`${id}-all-users`} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
              <Checkbox id={`${id}-all-users`} checked={allUsers} onCheckedChange={(checked) => setAllUsers(checked === true)} disabled={pending} />
              <span><span className="block text-sm font-medium">All active app users</span><span className="mt-1 block text-xs text-muted-foreground">The ad still follows its audience targeting. Test impressions use simulated funds only.</span></span>
            </label>
            {!allUsers ? <div className="space-y-2">
              <Label htmlFor={`${id}-testers`}>Tester usernames (comma-separated)</Label>
              <Input id={`${id}-testers`} value={usernames} onChange={(event) => setUsernames(event.target.value)} placeholder="alice, bob" required disabled={pending} autoComplete="off" />
            </div> : null}
            <div className="space-y-2">
              <Label htmlFor={`${id}-hours`}>Duration (hours, up to 30 days)</Label>
              <Input id={`${id}-hours`} type="number" min={1} max={720} step={1} value={hours} onChange={(event) => setHours(event.target.value)} required disabled={pending} />
            </div>
          </>}
          {error ? <p role="alert" className="break-words text-sm text-destructive">{error}</p> : null}
        </form>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" form={id} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : isTest ? <Square className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
          {pending ? "Working…" : isTest ? "Stop test" : "Approve & Run as Test"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
