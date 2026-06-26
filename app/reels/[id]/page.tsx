import { revalidatePath } from "next/cache"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Heart, MessageCircle } from "lucide-react"
import { CustomerShell } from "@/components/customer/customer-shell"
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

  return (
    <CustomerShell active="" signedIn={Boolean(viewer)}>
      <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">

        {/* Media */}
        <div className="bg-black">
          {isVideo ? (
            <video
              src={post.videoUrl}
              poster={post.thumbnailUrl || undefined}
              controls
              playsInline
              className="aspect-[9/16] w-full object-contain sm:aspect-video"
            />
          ) : images.length ? (
            <ImageCarousel images={images} alt={post.title || "ChatAndTip post"} />
          ) : (
            <div className="flex aspect-square items-center justify-center bg-neutral-900 text-sm text-neutral-600">
              No media
            </div>
          )}
        </div>

        {/* Creator row */}
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <Link href={`/profiles/${media.user.userId}`} className="flex min-w-0 items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-neutral-100">
              {media.user.profileAvatarUrl ? (
                <Image src={media.user.profileAvatarUrl} alt="" fill sizes="44px" className="object-cover" />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="truncate font-black hover:underline">
                {media.user.fullname || "ChatAndTip creator"}
              </p>
              <p className="truncate text-xs text-neutral-500">
                {media.user.username ? `@${media.user.username}` : "Creator"}
              </p>
            </div>
          </Link>
          {viewer && !ownPost ? (
            <form action={toggleFollow}>
              <input type="hidden" name="creatorId" value={media.user.userId} />
              <input type="hidden" name="mediaId" value={post.id} />
              <input type="hidden" name="next" value={media.following ? "false" : "true"} />
              <Button type="submit" variant={media.following ? "outline" : "default"} size="sm" className="rounded-full">
                {media.following ? "Following" : "Follow"}
              </Button>
            </form>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 border-y border-black/5 px-3 py-2">
          {viewer && !ownPost ? (
            <form action={toggleLike}>
              <input type="hidden" name="ownerId" value={media.user.userId} />
              <input type="hidden" name="mediaId" value={post.id} />
              <button
                type="submit"
                className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold transition ${
                  post.isLiked
                    ? "bg-rose-50 text-rose-600"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <Heart className={`h-5 w-5 ${post.isLiked ? "fill-current" : ""}`} />
                {post.likes.toLocaleString()}
              </button>
            </form>
          ) : (
            <span className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-neutral-600">
              <Heart className="h-5 w-5" />
              {post.likes.toLocaleString()}
            </span>
          )}

          <span className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-neutral-600">
            <MessageCircle className="h-5 w-5" />
            {post.commentCount.toLocaleString()}
          </span>

          <div className="ml-auto">
            <ShareButton
              url={`/reels/${post.id}`}
              title={post.title || "ChatAndTip post"}
              text={`${media.user.fullname || "A creator"} on ChatAndTip`}
            />
          </div>
        </div>

        {/* Caption */}
        {caption ? (
          <div className="px-5 py-4">
            {post.title && post.title !== caption ? (
              <p className="font-black">{post.title}</p>
            ) : null}
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{caption}</p>
          </div>
        ) : null}

        {/* Comments */}
        <div className="border-t border-black/5 px-5 py-5">
          <h2 className="font-black">
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
                  className="min-h-10 flex-1 resize-none rounded-2xl bg-neutral-50 text-sm"
                  required
                />
                <Button type="submit" size="sm" className="self-end rounded-full">
                  Post
                </Button>
              </div>
            </form>
          ) : (
            <p className="mt-3 rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-500">
              <Link href="/login" className="font-bold hover:underline">Sign in</Link> to join the conversation.
            </p>
          )}

          <div className="mt-5 space-y-4">
            {media.comments.map((comment) => (
              <article key={comment.id} className="flex gap-3">
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                  {comment.author.avatarUrl ? (
                    <Image src={comment.author.avatarUrl} alt="" fill sizes="36px" className="object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 rounded-2xl bg-neutral-50 p-3">
                  <p className="text-sm font-black">{comment.author.name}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                    {comment.text}
                  </p>
                  <p className="mt-2 text-xs text-neutral-400">
                    {new Date(comment.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}
                  </p>
                </div>
              </article>
            ))}
            {!media.comments.length ? (
              <p className="py-6 text-center text-sm text-neutral-500">No comments yet. Be the first!</p>
            ) : null}
          </div>
        </div>
      </div>
    </CustomerShell>
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
