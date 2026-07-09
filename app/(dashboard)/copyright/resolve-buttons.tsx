"use client"

import { useState, useTransition } from "react"
import { resolveCopyrightAction } from "@/lib/actions/copyright"

export function ResolveButtons({ mediaId }: { mediaId: string }) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState<string | null>(null)

  const act = (decision: "restore" | "remove") =>
    startTransition(async () => {
      await resolveCopyrightAction(mediaId, decision)
      setDone(decision === "restore" ? "Restored" : "Removed")
    })

  if (done) return <span className="text-sm text-white/60">{done}</span>

  return (
    <div className="flex gap-2">
      <button
        onClick={() => act("restore")}
        disabled={pending}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Restore
      </button>
      <button
        onClick={() => act("remove")}
        disabled={pending}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Remove
      </button>
    </div>
  )
}
