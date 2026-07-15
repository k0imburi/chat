"use client"

import { useState } from "react"
import { Flag } from "lucide-react"

export function ReportButton({
  action,
  iconOnly = false,
  className,
}: {
  /** Server action bound with the reported user's id, e.g. reportUser.bind(null, userId) */
  action: (formData: FormData) => void | Promise<void>
  iconOnly?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(formData: FormData) {
    setSubmitting(true)
    try {
      await action(formData)
      setSent(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report"
        className={
          className ??
          (iconOnly
            ? "flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/60 hover:text-white"
            : "flex flex-col items-center gap-1")
        }
      >
        <Flag className={iconOnly ? "h-4 w-4" : "h-[22px] w-[22px] text-white/70"} />
        {!iconOnly && <span className="text-xs font-bold text-white/70">Report</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 text-neutral-950"
            onClick={(e) => e.stopPropagation()}
          >
            {sent ? (
              <>
                <p className="font-black">Thanks — we&apos;ll review this.</p>
                <p className="mt-1 text-sm text-neutral-500">Our team will look into it shortly.</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-4 rounded-full bg-neutral-950 px-4 py-2 text-sm font-bold text-white"
                >
                  Close
                </button>
              </>
            ) : (
              <form action={handleSubmit} className="space-y-3">
                <p className="font-black">Report</p>
                <textarea
                  name="message"
                  required
                  placeholder="What's going on?"
                  rows={4}
                  className="w-full rounded-2xl border border-neutral-200 p-3 text-sm focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-full px-4 py-2 text-sm font-bold text-neutral-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    Submit
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
