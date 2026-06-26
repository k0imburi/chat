import { revalidatePath } from "next/cache"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Heart, MessageCircle } from "lucide-react"
import { FeedShell } from "@/components/customer/feed-shell"
import { ImageCarousel } from "@/components/customer/image-carousel"
import { ShareButton } from "@/components/customer/share-button"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createComment } from "@/lib/mobile-comments"
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

  return (
    <FeedShell active="" signedIn={Boolean(viewer)}>
      {/* Single-post view: full-screen media + scrollable comments below */}
      <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>

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

            <a href="#comments" className="flex flex-col items-center gap-1">
              <div className="flex h-12 w-12 items-center justify-center">
                <MessageCircle className="h-[26px] w-[26px] text-white" />
              </div>
              <span className="text-xs font-bold text-white drop-shadow-sm">{post.commentCount.toLocaleString()}</span>
            </a>

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

        {/* Comments section — scrolls below the full-screen post */}
        <div id="comments" className="min-h-screen bg-white px-5 py-6">
          <h2 className="font-black text-neutral-950">
            Comments{post.commentCount > 0 ? ` (${post.commentCount})` : ""}
          </h2>

          {viewer ? (
            <form action={addComment} className="mt-4 flex gap-3">
              <input type="hidden" name="mediaId" value={post.id} />
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                {viewer.profileAvatarUrl ? (
                  <Image src={viewer.profileAvatarUrl} alt="" fill sizes="36px" className="object-cover" />
                ) : null}
              </div>
              <div className="flex flex-1 gap-2">
                <Textarea
                  name="text"
                  placeholder="Add a comment…"
                  className="min-h-10 flex-1 resize-none rounded-2xl bg-neutral-50 text-sm text-neutral-950"
                  required
                />
                <Button type="submit" size="sm" className="self-end rounded-full">
                  Post
                </Button>
              </div>
            </form>
          ) : (
            <p className="mt-3 rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-500">
              <Link href="/login" className="font-bold hover:underline">
                Sign in
              </Link>{" "}
              to join the conversation.
            </p>
          )}

          <div className="mt-5 space-y-4">
            {media.comments.map((comment) => (
              <article key={comment.id} className="flex gap-3">
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                  {comment.author.avatarUrl ? (
                    <Image
                      src={comment.author.avatarUrl}
                      alt=""
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 rounded-2xl bg-neutral-50 p-3">
                  <p className="text-sm font-black text-neutral-950">{comment.author.name}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                    {comment.text}
                  </p>
                  <p className="mt-2 text-xs text-neutral-400">
                    {new Date(comment.createdAt).toLocaleString("en-KE", {
                      timeZone: "Africa/Nairobi",
                    })}
                  </p>
                </div>
              </article>
            ))}
            {!media.comments.length ? (
              <p className="py-8 text-center text-sm text-neutral-500">
                No comments yet. Be the first!
              </p>
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

async function addComment(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer) throw new Error("Sign in required")
  const mediaId = String(formData.get("mediaId") || "")
  const text = String(formData.get("text") || "").trim()
  if (!mediaId || !text) return
  await createComment(mediaId, viewer.userId, text)
  revalidatePath(`/reels/${mediaId}`)
}
