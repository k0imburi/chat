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
        <div id="comments" className="min-h-screen bg-neutral-50 text-neutral-950">
          {/* Section header */}
          <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 px-5 py-4 backdrop-blur-md">
            <h2 className="flex items-center gap-2 text-[15px] font-black text-neutral-950">
              Comments
              {post.commentCount > 0 && (
                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-bold text-neutral-500">
                  {post.commentCount.toLocaleString()}
                </span>
              )}
            </h2>
          </div>

          <div className="px-4 py-4">
            {/* Comment compose form */}
            {viewer ? (
              <form action={addComment} className="mb-5 flex items-start gap-3">
                <input type="hidden" name="mediaId" value={post.id} />
                <div className="relative mt-1 h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-200">
                  {viewer.profileAvatarUrl ? (
                    <Image src={viewer.profileAvatarUrl} alt="" fill sizes="36px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-500">
                      {(viewer.fullname || "?")[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Textarea
                    name="text"
                    placeholder="Write a comment…"
                    rows={2}
                    className="min-h-[44px] w-full resize-none rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-950 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
                    required
                  />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" className="h-8 rounded-full px-5 text-xs font-bold">
                      Post
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="mb-5 flex items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <p className="text-sm text-neutral-500">
                  <Link href="/login" className="font-bold text-neutral-950 hover:underline">
                    Sign in
                  </Link>{" "}
                  to join the conversation
                </p>
              </div>
            )}

            {/* Comment list */}
            {media.comments.length > 0 ? (
              <div className="space-y-1">
                {media.comments.map((comment, i) => (
                  <article key={comment.id} className={`flex gap-3 ${i > 0 ? "pt-3" : ""}`}>
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-200">
                      {comment.author.avatarUrl ? (
                        <Image
                          src={comment.author.avatarUrl}
                          alt=""
                          fill
                          sizes="36px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-500">
                          {(comment.author.name || "?")[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/[0.04]">
                        <div className="mb-1 flex items-baseline gap-2">
                          <span className="text-[13px] font-bold text-neutral-950">
                            {comment.author.name}
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            {new Date(comment.createdAt).toLocaleString("en-KE", {
                              timeZone: "Africa/Nairobi",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
                          {comment.text}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100">
                  <MessageCircle className="h-6 w-6 text-neutral-400" />
                </div>
                <p className="text-sm font-medium text-neutral-400">No comments yet</p>
                <p className="text-xs text-neutral-300">Be the first to share your thoughts</p>
              </div>
            )}
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
