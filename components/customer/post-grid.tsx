"use client"

import Link from "next/link"
import { useState } from "react"
import { Copy, Heart, MessageCircle, Play } from "lucide-react"
import type { CustomerFeedEntry } from "@/lib/customer-web"

export function PostGrid({
  entries,
  empty = "No posts yet.",
  cols = 3,
}: {
  entries: CustomerFeedEntry[]
  empty?: string
  cols?: 2 | 3
}) {
  if (!entries.length) {
    return (
      <div className="rounded-3xl border border-black/5 bg-white p-12 text-center shadow-sm">
        <p className="text-sm text-neutral-500">{empty}</p>
      </div>
    )
  }

  const gridClass =
    cols === 2
      ? "grid grid-cols-2 gap-px"
      : "grid grid-cols-2 gap-px sm:grid-cols-3"

  return (
    <div className={`${gridClass} overflow-hidden rounded-2xl bg-neutral-200 shadow-sm`}>
      {entries.map((entry) => (
        <PostGridItem key={entry.video.id} entry={entry} />
      ))}
    </div>
  )
}

function PostGridItem({ entry }: { entry: CustomerFeedEntry }) {
  const [imgFailed, setImgFailed] = useState(false)
  const { video } = entry
  const thumb = video.imageUrl || video.thumbnailUrl || video.images?.[0] || ""
  const isVideo = Boolean(video.videoUrl)
  const isMulti = (video.images?.length ?? 0) > 1

  return (
    <Link
      href={`/reels/${video.id}`}
      className="group relative block aspect-square overflow-hidden bg-neutral-900"
    >
      {thumb && !imgFailed ? (
        <img
          src={thumb}
          alt={video.title || "post"}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-neutral-600">
          No media
        </div>
      )}

      {isMulti && (
        <span className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm">
          <Copy className="h-3 w-3" />
        </span>
      )}

      {isVideo && (
        <span className="absolute left-2 top-2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm">
          <Play className="h-3 w-3 fill-current" />
        </span>
      )}

      {/* Always-visible stats bar — a hover-only overlay never shows on touch devices */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-white">
        <span className="flex items-center gap-1 text-xs font-bold">
          <Heart className="h-3.5 w-3.5 fill-current" />
          {video.likes.toLocaleString()}
        </span>
        <span className="flex items-center gap-1 text-xs font-bold">
          <MessageCircle className="h-3.5 w-3.5 fill-current" />
          {video.commentCount.toLocaleString()}
        </span>
      </div>
    </Link>
  )
}
