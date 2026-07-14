"use client"

import { useState } from "react"
import { Heart } from "lucide-react"

// Client-side like/follow so a tap doesn't trigger a server revalidatePath —
// that used to remount the whole page (including the <video>), flashing/
// restarting playback on every like or follow.
export function LikeButton({
  viewerId,
  ownerId,
  mediaId,
  initialLiked,
  initialLikes,
}: {
  viewerId?: string
  ownerId: string
  mediaId: string
  initialLiked: boolean
  initialLikes: number
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [likes, setLikes] = useState(initialLikes)

  async function toggle() {
    if (!viewerId) {
      window.location.href = "/login"
      return
    }
    const wasLiked = liked
    setLiked(!wasLiked)
    setLikes((c) => (wasLiked ? c - 1 : c + 1))
    try {
      await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentUserId: viewerId, ownerId, videoId: mediaId }),
      })
    } catch {
      setLiked(wasLiked)
      setLikes((c) => (wasLiked ? c + 1 : c - 1))
    }
  }

  return (
    <button onClick={toggle} className="flex flex-col items-center gap-1">
      <div className="flex h-12 w-12 items-center justify-center">
        <Heart className={`h-[26px] w-[26px] ${liked ? "fill-rose-500 text-rose-500" : "text-white"}`} />
      </div>
      <span className="text-xs font-bold text-white">{likes.toLocaleString()}</span>
    </button>
  )
}

export function FollowButton({
  viewerId,
  followedId,
  initialFollowing,
}: {
  viewerId?: string
  followedId: string
  initialFollowing: boolean
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [pending, setPending] = useState(false)

  async function toggle() {
    if (!viewerId) {
      window.location.href = "/login"
      return
    }
    const next = !following
    setPending(true)
    setFollowing(next)
    try {
      await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followerId: viewerId, followedId, follow: next }),
      })
    } catch {
      setFollowing(!next)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`rounded-full border px-3 py-1 text-xs font-bold ${
        following ? "border-white/40 text-white/70" : "border-white text-white"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  )
}
