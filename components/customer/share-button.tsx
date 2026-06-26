"use client"

import { Share2 } from "lucide-react"

export function ShareButton({
  url,
  title,
  text,
}: {
  url: string
  title: string
  text: string
}) {
  async function share() {
    const absoluteUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`
    if (navigator.share) {
      await navigator.share({ title, text, url: absoluteUrl })
      return
    }
    await navigator.clipboard.writeText(absoluteUrl)
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
    >
      <Share2 className="h-4 w-4" />
      Share
    </button>
  )
}
