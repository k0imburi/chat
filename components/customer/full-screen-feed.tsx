"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Heart, MessageCircle, Share2, Volume2, VolumeX } from "lucide-react"
import type { CustomerFeedEntry } from "@/lib/customer-web"

export function FullScreenFeed({
  entries,
  viewerId,
}: {
  entries: CustomerFeedEntry[]
  viewerId?: string
}) {
  if (!entries.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-white/50">No posts yet. Check back soon.</p>
      </div>
    )
  }

  return (
    <div
      className="h-full overflow-y-scroll snap-y snap-mandatory"
      style={{ scrollbarWidth: "none" }}
    >
      {entries.map((entry) => (
        <FullScreenPost key={entry.video.id} entry={entry} viewerId={viewerId} />
      ))}
    </div>
  )
}

function FullScreenPost({
  entry,
  viewerId,
}: {
  entry: CustomerFeedEntry
  viewerId?: string
}) {
  const { video, user } = entry
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [liked, setLiked] = useState(video.isLiked ?? false)
  const [likeCount, setLikeCount] = useState(video.likes)
  const [muted, setMuted] = useState(true)

  const images = video.images?.length ? video.images : video.imageUrl ? [video.imageUrl] : []
  const isVideo = Boolean(video.videoUrl)
  const thumb = video.thumbnailUrl || images[0] || ""
  const caption = video.caption || video.description || video.title || ""
  const handle = user.username
    ? `@${user.username}`
    : `@${(user.fullname ?? "creator").replace(/\s+/g, "").toLowerCase()}`

  // Autoplay/pause as the post enters/leaves the viewport
  useEffect(() => {
    const container = containerRef.current
    const vid = videoRef.current
    if (!container || !vid) return

    const observer = new IntersectionObserver(
      ([{ isIntersecting }]) => {
        if (isIntersecting) {
          vid.play().catch(() => {})
        } else {
          vid.pause()
          vid.currentTime = 0
        }
      },
      { threshold: 0.65 },
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  async function handleLike() {
    if (!viewerId) {
      window.location.href = "/login"
      return
    }
    const wasLiked = liked
    setLiked(!wasLiked)
    setLikeCount((c) => (wasLiked ? c - 1 : c + 1))
    try {
      await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentUserId: viewerId,
          ownerId: user.userId,
          videoId: video.id,
        }),
      })
    } catch {
      setLiked(wasLiked)
      setLikeCount((c) => (wasLiked ? c + 1 : c - 1))
    }
  }

  function handleShare() {
    const url = `${window.location.origin}/reels/${video.id}`
    if (navigator.share) {
      navigator.share({ url, title: video.title || "ChatAndTip post" }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url)
    }
  }

  return (
    <div ref={containerRef} className="relative h-dvh snap-start overflow-hidden bg-black">
      {/* Media — fills the entire screen */}
      {isVideo ? (
        <video
          ref={videoRef}
          src={video.videoUrl}
          poster={thumb || undefined}
          loop
          muted={muted}
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : images.length ? (
        <img
          src={images[0]}
          alt={video.title || "post"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-neutral-900" />
      )}

      {/* Gradient — heavier at bottom to make text readable */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0.06) 70%, transparent 100%)",
        }}
      />

      {/* ── Right action bar ── */}
      <div className="absolute bottom-28 right-3 flex flex-col items-center gap-5">
        {/* Creator avatar */}
        <Link href={`/profiles/${user.userId}`} className="relative mb-1 block">
          <div className="h-11 w-11 overflow-hidden rounded-full border-2 border-white bg-neutral-700">
            {user.profileAvatarUrl ? (
              <img src={user.profileAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <span className="absolute -bottom-1.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow">
            +
          </span>
        </Link>

        {/* Like */}
        <ActionButton
          onClick={handleLike}
          count={likeCount}
          label="Like"
          icon={
            <Heart
              className={`h-[26px] w-[26px] transition-colors ${liked ? "fill-rose-500 text-rose-500" : "text-white"}`}
            />
          }
        />

        {/* Comment — links to post detail */}
        <Link href={`/reels/${video.id}#comments`} className="flex flex-col items-center gap-1">
          <div className="flex h-12 w-12 items-center justify-center">
            <MessageCircle className="h-[26px] w-[26px] text-white" />
          </div>
          <span className="text-xs font-bold text-white drop-shadow-sm">
            {video.commentCount.toLocaleString()}
          </span>
        </Link>

        {/* Share */}
        <ActionButton onClick={handleShare} label="Share" icon={<Share2 className="h-6 w-6 text-white" />} />

        {/* Mute toggle (videos only) */}
        {isVideo && (
          <button
            onClick={() => setMuted((m) => !m)}
            className="flex h-12 w-12 items-center justify-center"
          >
            {muted ? (
              <VolumeX className="h-6 w-6 text-white/60" />
            ) : (
              <Volume2 className="h-6 w-6 text-white" />
            )}
          </button>
        )}
      </div>

      {/* ── Bottom info ── */}
      <div className="absolute bottom-20 left-4 right-20 space-y-1.5">
        <Link href={`/profiles/${user.userId}`}>
          <p className="text-[15px] font-black text-white drop-shadow-md">{handle}</p>
        </Link>
        {caption ? (
          <p className="line-clamp-3 text-sm leading-5 text-white/90 drop-shadow-sm">{caption}</p>
        ) : null}
      </div>
    </div>
  )
}

function ActionButton({
  onClick,
  count,
  icon,
  label,
}: {
  onClick: () => void
  count?: number
  icon: React.ReactNode
  label: string
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1">
      <div className="flex h-12 w-12 items-center justify-center">{icon}</div>
      {count !== undefined ? (
        <span className="text-xs font-bold text-white drop-shadow-sm">{count.toLocaleString()}</span>
      ) : (
        <span className="text-xs font-bold text-white/70 drop-shadow-sm">{label}</span>
      )}
    </button>
  )
}
