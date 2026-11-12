"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { BarChart3, Bookmark, ChevronLeft, ChevronRight, ChevronRight as CtaArrow, Download, EyeOff, Flag, Heart, Megaphone, MoreHorizontal, Repeat2, Rocket, Share2, Volume2, VolumeX, X } from "lucide-react"
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
  const [saved, setSaved] = useState(video.isSaved ?? false)
  const [reposted, setReposted] = useState(video.isReposted ?? false)
  const [repostCount, setRepostCount] = useState(video.repostCount ?? 0)
  const [captionExpanded, setCaptionExpanded] = useState(false)
  const [muted, setMuted] = useState(true)
  const [imgIndex, setImgIndex] = useState(0)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [notice, setNotice] = useState("")

  const images = video.images?.length ? video.images : video.imageUrl ? [video.imageUrl] : []
  const isVideo = Boolean(video.videoUrl)
  const thumb = video.thumbnailUrl || images[0] || ""
  const caption = postCopy(video.caption, video.description)
  const isAd = Boolean(video.adCampaignId)
  const handle = user.username
    ? `@${user.username}`
    : `@${(user.fullname ?? "creator").replace(/\s+/g, "").toLowerCase()}`

  async function recordAdEvent(kind: "CLICK" | "LIKE" | "COMMENT" | "SHARE") {
    if (!viewerId || !video.adDeliveryId || !isAd) return
    try {
      await fetch("/api/mobile/ads/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId: video.adDeliveryId, kind }),
      })
    } catch {
      // Engagement state is owned by the normal post endpoint. Ad billing is
      // deliberately best-effort and idempotent on the server.
    }
  }

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

  useEffect(() => {
    if (!viewerId || !video.adDeliveryId) return
    const container = containerRef.current
    if (!container) return
    let recorded = false
    const observer = new IntersectionObserver(([entry]) => {
      if (!recorded && entry.isIntersecting) {
        recorded = true
        void fetch("/api/mobile/ads/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliveryId: video.adDeliveryId, kind: "IMPRESSION" }),
        })
      }
    }, { threshold: 0.65 })
    observer.observe(container)
    return () => observer.disconnect()
  }, [viewerId, video.adDeliveryId])

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
      const response = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentUserId: viewerId, ownerId: user.userId, videoId: video.id }),
      })
      if (!response.ok) throw new Error("like failed")
      if (!wasLiked) await recordAdEvent("LIKE")
    } catch {
      setLiked(wasLiked)
      setLikeCount((c) => (wasLiked ? c + 1 : c - 1))
    }
  }

  function handleShare() {
    const url = `${window.location.origin}/reels/${video.id}`
    if (navigator.share) {
      void navigator.share({ url, title: video.title || "ChatAndTip post" }).then(
        () => recordAdEvent("SHARE"),
        () => {},
      )
    } else {
      void navigator.clipboard?.writeText(url).then(() => recordAdEvent("SHARE"))
    }
  }

  async function toggleSave() {
    if (!viewerId) { window.location.href = "/login"; return }
    const previous = saved
    setSaved(!previous)
    try {
      const response = await fetch(`/api/mobile/saves/${video.id}`, { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error("save failed")
      setSaved(Boolean(data.saved))
    } catch { setSaved(previous) }
  }

  async function toggleRepost() {
    if (!viewerId) { window.location.href = "/login"; return }
    const previous = reposted
    setReposted(!previous)
    setRepostCount((count) => Math.max(0, count + (previous ? -1 : 1)))
    try {
      const response = await fetch("/api/mobile/profile/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "repost", mediaId: video.id, reposted: !previous }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error("repost failed")
      setReposted(Boolean(data.reposted))
      setRepostCount(Number(data.repostCount ?? 0))
      if (!previous && data.reposted) await recordAdEvent("SHARE")
    } catch {
      setReposted(previous)
      setRepostCount((count) => Math.max(0, count + (previous ? 1 : -1)))
    }
  }

  async function markNotInterested() {
    const response = await fetch(`/api/mobile/media/${video.id}/not-interested`, { method: "POST" })
    if (!response.ok) throw new Error("Could not hide this post")
    setDismissed(true)
  }

  async function reportPost() {
    const message = window.prompt("Tell us why you are reporting this post")?.trim()
    if (!message) return
    const response = await fetch("/api/mobile/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, reportedUserId: user.userId, mediaId: video.id }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.message || "Could not report this post")
    setNotice("Thanks. We will review this post.")
  }

  async function downloadPost() {
    if (!viewerId) { window.location.href = "/login"; return }
    const response = await fetch(`/api/mobile/media/${video.id}/download`)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setNotice(data.message || "This post cannot be downloaded"); return }
    const url = data.data?.url || data.data?.images?.[0]
    if (url) window.open(url, "_blank", "noopener,noreferrer")
  }

  if (dismissed) return null

  return (
    <div ref={containerRef} className="relative h-dvh snap-start overflow-hidden bg-black">
      {/* ── Media ── */}
      {isVideo ? (
        <video
          ref={videoRef}
          src={video.videoUrl}
          poster={thumb || undefined}
          autoPlay
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
      <div className="absolute bottom-24 right-3 z-10 flex flex-col items-center gap-2.5">
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
          onCommentPosted={() => void recordAdEvent("COMMENT")}
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

        <ActionButton
          onClick={toggleRepost}
          count={repostCount}
          label="Reshare"
          icon={<Repeat2 className={`h-6 w-6 ${reposted ? "text-emerald-400" : "text-white"}`} />}
        />

        <ActionButton
          onClick={toggleSave}
          label="Save"
          icon={<Bookmark className={`h-6 w-6 ${saved ? "fill-white text-white" : "text-white"}`} />}
        />

        <ActionButton
          onClick={handleShare}
          count={video.shareCount}
          label="Share"
          icon={<Share2 className="h-6 w-6 text-white" />}
        />

        <ActionButton
          onClick={() => void downloadPost()}
          label=""
          icon={<Download className="h-6 w-6 text-white" />}
        />

        {/* Direct message — separate from comments, added alongside the same
            split on the app: the comment button opens comments, this opens a
            DM with the poster. Hidden on your own post, since there is
            nobody else to message. */}
        {viewerId && viewerId !== user.userId ? (
          <Link href={`/inbox/${user.userId}`} className="flex flex-col items-center gap-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 ring-1 ring-white/10 backdrop-blur-sm">
              <svg viewBox="0 0 24 24" className="h-[26px] w-[26px] fill-none stroke-white stroke-2">
                <path d="M4 4h16v12H8l-4 4V4z" />
              </svg>
            </div>
            <span className="text-[11px] font-bold text-white/80">Message</span>
          </Link>
        ) : null}

        {/* Mute (video only) */}
        {isVideo && (
          <button
            onClick={() => setMuted((m) => !m)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 ring-1 ring-white/10 backdrop-blur-sm"
          >
            {muted ? (
              <VolumeX className="h-6 w-6 text-white/60" />
            ) : (
              <Volume2 className="h-6 w-6 text-white" />
            )}
          </button>
        )}

        <ActionButton
          onClick={() => setOptionsOpen(true)}
          label=""
          icon={<span className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-white/10"><MoreHorizontal className="h-5 w-5 text-white/75" /></span>}
        />
      </div>

      {/* ── Bottom info ── */}
      <div className="absolute bottom-20 left-4 right-20 z-10 space-y-1.5">
        {(video.recentReposters?.length || video.repostCount) ? <ReshareCluster reposters={video.recentReposters || []} count={video.repostCount || 0} /> : null}
        {isAd && video.adCta ? (
          <a onClick={() => void recordAdEvent("CLICK")} href={video.adWebsite || `/profiles/${user.userId}`} target={video.adWebsite?"_blank":undefined} rel={video.adWebsite?"noreferrer":undefined} style={{backgroundColor:video.adCtaColor||"#C21E55"}} className="mb-3 flex h-12 w-full items-center justify-between rounded-md px-4 text-sm font-extrabold text-white shadow-lg">
            <span>{video.adCta}</span><CtaArrow className="h-5 w-5" />
          </a>
        ) : null}
        <div className="flex items-center gap-2">
          <Link href={`/profiles/${user.userId}`}><p className="text-[15px] font-black text-white">{handle}</p></Link>
          {isAd ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white/75"><Megaphone className="h-3 w-3" /> Ad</span> : null}
        </div>
        {video.containsAi ? <p className="text-[11px] font-medium text-white/50">AI content</p> : null}
        {caption ? (
          <button onClick={() => setCaptionExpanded((expanded) => !expanded)} className="block max-w-full text-left text-sm leading-5 text-white/90">
            <span className={`block ${captionExpanded?"":isAd?"line-clamp-1":"line-clamp-3"}`}>{caption}</span>
            {!isAd&&caption.length>100?<span className="mt-0.5 block text-xs font-semibold text-white/60">{captionExpanded?"less":"more"}</span>:null}
          </button>
        ) : null}
      </div>

      {notice ? <div className="absolute left-1/2 top-20 z-40 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-bold text-black shadow-xl">{notice}</div> : null}
      {optionsOpen ? (
        <div className="absolute inset-0 z-50 flex items-end bg-black/55" onClick={() => setOptionsOpen(false)}>
          <div className="w-full rounded-t-[20px] bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-black dark:bg-[#151716] dark:text-white" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/20 dark:bg-white/25" />
            <div className="flex items-center justify-between px-2 py-2"><b>Post options</b><button onClick={() => setOptionsOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>
            {isAd ? <Option danger icon={<Flag/>} label="Report this ad" onClick={() => { setOptionsOpen(false);void reportPost().catch(error=>setNotice(error.message)) }} /> : <>
              {viewerId === user.userId ? <Option icon={<Rocket/>} label="Boost post" onClick={() => { location.href=`/ads/create?sourceMediaId=${encodeURIComponent(video.id)}` }} /> : null}
              <Option icon={<BarChart3/>} label="View post activity" detail={`${video.views.toLocaleString()} views · ${likeCount.toLocaleString()} likes · ${repostCount.toLocaleString()} reshares`} onClick={() => { setNotice(`${video.views.toLocaleString()} views · ${likeCount.toLocaleString()} likes · ${repostCount.toLocaleString()} reshares`);setOptionsOpen(false) }} />
              {viewerId && viewerId !== user.userId ? <Option icon={<EyeOff/>} label="Not interested" onClick={() => { void markNotInterested().catch(error=>setNotice(error.message));setOptionsOpen(false) }} /> : null}
              {viewerId && viewerId !== user.userId ? <Option danger icon={<Flag/>} label="Report this post" onClick={() => { setOptionsOpen(false);void reportPost().catch(error=>setNotice(error.message)) }} /> : null}
            </>}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ReshareCluster({reposters,count}:{reposters:Array<{id?:string;name?:string;avatarUrl?:string}>;count:number}) {
  const visible=reposters.slice(0,2)
  return <div className="mb-1 flex w-fit items-center gap-1.5 rounded-full bg-black/25 px-2 py-1 backdrop-blur-sm" title={visible.map(item=>item.name).filter(Boolean).join(", ") || `${count} reshares`}>
    {visible.length?<span className="flex -space-x-2">{visible.map((item,index)=><span key={item.id||index} className="h-6 w-6 overflow-hidden rounded-full border border-black bg-neutral-700">{item.avatarUrl?<img src={item.avatarUrl} alt="" className="h-full w-full object-cover"/>:null}</span>)}</span>:null}
    <Repeat2 className="h-3.5 w-3.5 text-[#58D7A3]"/>{!visible.length?<span className="text-xs font-bold text-white">{count}</span>:null}
  </div>
}

function Option({icon,label,detail,onClick,danger=false}:{icon:React.ReactNode;label:string;detail?:string;onClick:()=>void;danger?:boolean}) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 ${danger?"text-rose-500":""}`}><span className="grid h-9 w-9 place-items-center [&>svg]:h-5 [&>svg]:w-5">{icon}</span><span className="flex-1"><b className="block text-sm">{label}</b>{detail?<span className="text-xs text-black/45 dark:text-white/45">{detail}</span>:null}</span></button>
}

function postCopy(caption?: string, description?: string) {
  const first = caption?.trim() || ""
  const second = description?.trim() || ""
  if (!first) return second
  if (!second || normalizeCopy(first) === normalizeCopy(second)) return first
  return `${first}\n${second}`
}

function normalizeCopy(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}#]+/gu, " ").replace(/\s+/g, " ").trim()
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
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 ring-1 ring-white/10 backdrop-blur-sm">{icon}</div>
      {count !== undefined && count > 0 ? (
        <span className="text-[11px] font-bold text-white">{count.toLocaleString()}</span>
      ) : label ? (
        <span className="text-[11px] font-bold text-white/80">{label}</span>
      ) : null}
    </button>
  )
}
