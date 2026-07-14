"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Heart, Share2, Volume2, VolumeX } from "lucide-react"
import type { CustomerFeedEntry } from "@/lib/customer-web"
import { CommentSheet } from "@/components/customer/comment-sheet"

export function FullScreenFeed({
  entries,
  viewerId,
  viewerName,
  viewerAvatarUrl,
}: {
  entries: CustomerFeedEntry[]
  viewerId?: string
  viewerName?: string | null
  viewerAvatarUrl?: string | null
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
        <FullScreenPost
          key={entry.video.id}
          entry={entry}
          viewerId={viewerId}
          viewerName={viewerName}
          viewerAvatarUrl={viewerAvatarUrl}
        />
      ))}
    </div>
  )
}

function FullScreenPost({
  entry,
  viewerId,
  viewerName,
  viewerAvatarUrl,
}: {
  entry: CustomerFeedEntry
  viewerId?: string
  viewerName?: string | null
  viewerAvatarUrl?: string | null
}) {
  const { video, user } = entry
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [liked, setLiked] = useState(video.isLiked ?? false)
  const [likeCount, setLikeCount] = useState(video.likes)
  const [muted, setMuted] = useState(true)
  const [imgIndex, setImgIndex] = useState(0)

  const images = video.images?.length ? video.images : video.imageUrl ? [video.imageUrl] : []
  const isVideo = Boolean(video.videoUrl)
  const thumb = video.thumbnailUrl || images[0] || ""
  const caption = video.caption || video.description || video.title || ""
  const handle = user.username
    ? `@${user.username}`
    : `@${(user.fullname ?? "creator").replace(/\s+/g, "").toLowerCase()}`

  // Autoplay / pause via IntersectionObserver
  useEffect(() => {
    const container = containerRef.current
    const vid = videoRef.current
    if (!container || !vid) return
    const observer = new IntersectionObserver(
      ([{ isIntersecting }]) => {
        if (isIntersecting) { vid.play().catch(() => {}) }
        else { vid.pause(); vid.currentTime = 0 }
      },
      { threshold: 0.65 },
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Reset image index when this post leaves view
  useEffect(() => {
    const container = containerRef.current
    if (!container || isVideo) return
    const observer = new IntersectionObserver(
      ([{ isIntersecting }]) => { if (!isIntersecting) setImgIndex(0) },
      { threshold: 0.1 },
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [isVideo])

  async function handleLike() {
    if (!viewerId) { window.location.href = "/login"; return }
    const wasLiked = liked
    setLiked(!wasLiked)
    setLikeCount((c) => (wasLiked ? c - 1 : c + 1))
    try {
      await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentUserId: viewerId, ownerId: user.userId, videoId: video.id }),
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
      {/* ── Media ── */}
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
        <>
          <img
            src={images[imgIndex]}
            alt={video.title || "post"}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Swipe arrows for multi-image */}
          {images.length > 1 && (
            <>
              <button
                onClick={() => setImgIndex((i) => Math.max(0, i - 1))}
                disabled={imgIndex === 0}
                className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white disabled:opacity-20"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setImgIndex((i) => Math.min(images.length - 1, i + 1))}
                disabled={imgIndex === images.length - 1}
                className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white disabled:opacity-20"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              {/* Dot indicators */}
              <div className="absolute top-20 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
                {images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setImgIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === imgIndex ? "w-4 bg-white" : "w-1.5 bg-white/50"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-neutral-900" />
      )}

      {/* Gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.18) 40%, rgba(0,0,0,0.04) 70%, transparent 100%)",
        }}
      />

      {/* ── Right action bar ── */}
      <div className="absolute bottom-28 right-3 z-10 flex flex-col items-center gap-5">
        {/* Creator avatar */}
        <Link href={`/profiles/${user.userId}`} className="relative mb-1 block">
          <div className="h-11 w-11 overflow-hidden rounded-full border-2 border-white bg-neutral-700">
            {user.profileAvatarUrl ? (
              <img src={user.profileAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <span className="absolute -bottom-1.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white">
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

        {/* Comments — bottom sheet */}
        <CommentSheet
          mediaId={video.id}
          commentCount={video.commentCount}
          comments={[]}
          viewerAvatarUrl={viewerAvatarUrl}
          viewerName={viewerName}
          signedIn={Boolean(viewerId)}
          trigger={(openSheet) => (
            <ActionButton
              onClick={openSheet}
              count={video.commentCount}
              label="Comments"
              icon={
                <svg viewBox="0 0 24 24" className="h-[26px] w-[26px] fill-none stroke-white stroke-2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              }
            />
          )}
        />

        {/* Share */}
        <ActionButton
          onClick={handleShare}
          label="Share"
          icon={<Share2 className="h-6 w-6 text-white" />}
        />

        {/* Mute (video only) */}
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
      <div className="absolute bottom-20 left-4 right-20 z-10 space-y-1.5">
        <Link href={`/profiles/${user.userId}`}>
          <p className="text-[15px] font-black text-white">{handle}</p>
        </Link>
        {caption ? (
          <p className="line-clamp-3 text-sm leading-5 text-white/90">{caption}</p>
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
        <span className="text-xs font-bold text-white">{count.toLocaleString()}</span>
      ) : (
        <span className="text-xs font-bold text-white/70">{label}</span>
      )}
    </button>
  )
}
