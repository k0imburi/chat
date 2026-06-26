import { revalidatePath } from "next/cache"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Heart } from "lucide-react"
import { FeedShell } from "@/components/customer/feed-shell"
import { ImageCarousel } from "@/components/customer/image-carousel"
import { ShareButton } from "@/components/customer/share-button"
import { ReelCommentButton } from "@/components/customer/reel-comment-button"
import { followUser, toggleVideoLike } from "@/lib/mobile-social"
import { getCurrentCustomerUser, getCustomerMedia } from "@/lib/customer-web"

export default async function PublicReelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewer = await getCurrentCustomerUser()
  const media = await getCustomerMedia(id, viewer?.userId)
  if (!media) return notFound()

  const post = media.video
  const images = post.images?.length ? post.images : post.imageUrl ? [post.imageUrl] : []
  const isVideo = Boolean(post.videoUrl)
  const caption = post.caption || post.description || post.title || ""
  const ownPost = viewer?.userId === media.user.userId
  const handle = media.user.username
    ? `@${media.user.username}`
    : media.user.fullname || "Creator"

  const commentItems = media.comments.map((c) => ({
    id: c.id,
    text: c.text,
    createdAt: typeof c.createdAt === "string" ? c.createdAt : c.createdAt.toISOString(),
    author: { name: c.author.name, avatarUrl: c.author.avatarUrl ?? null },
  }))

  return (
    <FeedShell active="" signedIn={Boolean(viewer)}>
      {/* Single-post view: full-screen only, comments open as bottom sheet */}
      <div className="h-full overflow-hidden">

        {/* Full-screen media section */}
        <div className="relative h-dvh bg-black">
          {isVideo ? (
            <video
              src={post.videoUrl}
              poster={post.thumbnailUrl || undefined}
              controls
              playsInline
              autoPlay
              loop
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : images.length ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <ImageCarousel images={images} alt={post.title || "ChatAndTip post"} />
            </div>
          ) : (
            <div className="absolute inset-0 bg-neutral-900" />
          )}

          {/* Gradient overlay */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.12) 40%, transparent 70%)",
            }}
          />

          {/* Right actions */}
          <div className="absolute bottom-28 right-3 flex flex-col items-center gap-5">
            <Link href={`/profiles/${media.user.userId}`} className="relative mb-1 block">
              <div className="h-11 w-11 overflow-hidden rounded-full border-2 border-white bg-neutral-700">
                {media.user.profileAvatarUrl ? (
                  <img src={media.user.profileAvatarUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              {!media.following && !ownPost && (
                <span className="absolute -bottom-1.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow">
                  +
                </span>
              )}
            </Link>

            {viewer && !ownPost ? (
              <form action={toggleLike} className="flex flex-col items-center gap-1">
                <input type="hidden" name="ownerId" value={media.user.userId} />
                <input type="hidden" name="mediaId" value={post.id} />
                <button type="submit" className="flex h-12 w-12 items-center justify-center">
                  <Heart
                    className={`h-[26px] w-[26px] ${post.isLiked ? "fill-rose-500 text-rose-500" : "text-white"}`}
                  />
                </button>
                <span className="text-xs font-bold text-white drop-shadow-sm">{post.likes.toLocaleString()}</span>
              </form>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <div className="flex h-12 w-12 items-center justify-center">
                  <Heart className="h-[26px] w-[26px] text-white" />
                </div>
                <span className="text-xs font-bold text-white drop-shadow-sm">{post.likes.toLocaleString()}</span>
              </div>
            )}

            <ReelCommentButton
              mediaId={post.id}
              commentCount={post.commentCount}
              comments={commentItems}
              viewerAvatarUrl={viewer?.profileAvatarUrl ?? null}
              viewerName={viewer?.fullname ?? null}
              signedIn={Boolean(viewer)}
            />

            <div className="flex flex-col items-center gap-1">
              <div className="flex h-12 w-12 items-center justify-center">
                <ShareButton
                  url={`/reels/${post.id}`}
                  title={post.title || "ChatAndTip post"}
                  text={`${media.user.fullname || "A creator"} on ChatAndTip`}
                />
              </div>
            </div>
          </div>

          {/* Bottom info */}
          <div className="absolute bottom-20 left-4 right-20 space-y-1.5">
            <div className="flex items-center gap-3">
              <Link href={`/profiles/${media.user.userId}`}>
                <p className="text-[15px] font-black text-white drop-shadow-md">{handle}</p>
              </Link>
              {viewer && !ownPost ? (
                <form action={toggleFollow}>
                  <input type="hidden" name="creatorId" value={media.user.userId} />
                  <input type="hidden" name="mediaId" value={post.id} />
                  <input type="hidden" name="next" value={media.following ? "false" : "true"} />
                  <button
                    type="submit"
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${
                      media.following
                        ? "border-white/40 text-white/70"
                        : "border-white text-white"
                    }`}
                  >
                    {media.following ? "Following" : "Follow"}
                  </button>
                </form>
              ) : null}
            </div>
            {caption ? (
              <p className="line-clamp-2 text-sm leading-5 text-white/90 drop-shadow-sm">{caption}</p>
            ) : null}
          </div>
        </div>
      </div>
    </FeedShell>
  )
}

async function toggleLike(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer) throw new Error("Sign in required")
  const ownerId = String(formData.get("ownerId") || "")
  const mediaId = String(formData.get("mediaId") || "")
  await toggleVideoLike({ currentUserId: viewer.userId, ownerId, videoId: mediaId })
  revalidatePath(`/reels/${mediaId}`)
}

async function toggleFollow(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer) throw new Error("Sign in required")
  const followedId = String(formData.get("creatorId") || "")
  const mediaId = String(formData.get("mediaId") || "")
  await followUser({
    followerId: viewer.userId,
    followedId,
    follow: String(formData.get("next")) === "true",
  })
  revalidatePath(`/reels/${mediaId}`)
  revalidatePath(`/profiles/${followedId}`)
}
