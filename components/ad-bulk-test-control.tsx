"use client"

import { useId, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { FlaskConical, Loader2 } from "lucide-react"
import { resetAllApprovedAdsAsTestAction } from "@/lib/actions/ad-review"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function AdBulkTestControl() {
  const id = useId()
  const router = useRouter()
  const busy = useRef(false)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [hours, setHours] = useState("720")
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const durationHours = Number(hours)
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 720) {
      setError("Choose a whole-number duration from 1 to 720 hours.")
      return
    }
    busy.current = true
    setPending(true)
    setError(null)
    try {
      const result = await resetAllApprovedAdsAsTestAction(durationHours)
      if (result.failed.length) {
        setError(`Started ${result.started}; ${result.failed.length} could not start: ${result.failed.join("; ")}`)
      } else if (result.started === 0) {
        setError("No approved campaigns with a configured budget were available to test.")
      } else {
        setOpen(false)
      }
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The bulk test could not be started.")
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return <Dialog open={open} onOpenChange={(next) => {
    if (busy.current) return
    setOpen(next)
    setError(null)
  }}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline"><FlaskConical className="h-4 w-4" />Reset approved ads for testing</Button>
    </DialogTrigger>
    <DialogContent className="sm:w-[480px]" hideCloseButton={pending}>
      <DialogHeader>
        <DialogTitle>Reset approved ads for all users?</DialogTitle>
        <DialogDescription>Creates a fresh test copy for every approved campaign with a configured budget, including depleted or expired campaigns. Existing copies are stopped after the new copy starts. Original campaigns and advertiser balances are not changed.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form id={id} onSubmit={submit} className="space-y-4" aria-busy={pending}>
          <div className="space-y-2">
            <Label htmlFor={`${id}-hours`}>Test duration (hours, up to 30 days)</Label>
            <Input id={`${id}-hours`} type="number" min={1} max={720} step={1} value={hours} onChange={(event) => setHours(event.target.value)} required disabled={pending} />
          </div>
          <p className="text-sm text-muted-foreground">Test copies use simulated budgets and remain subject to each campaign’s audience, pacing and daily delivery limits. Spend is recorded only on the test copies.</p>
          {error ? <p role="alert" className="break-words text-sm text-destructive">{error}</p> : null}
        </form>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" form={id} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
          {pending ? "Resetting tests…" : "Reset test copies"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
