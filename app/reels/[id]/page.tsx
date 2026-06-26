import { revalidatePath } from "next/cache"
import Image from "next/image"
import { notFound } from "next/navigation"
import { Heart, MessageCircle } from "lucide-react"
import { CustomerShell } from "@/components/customer/customer-shell"
import { ShareButton } from "@/components/customer/share-button"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createComment } from "@/lib/mobile-comments"
import { followUser } from "@/lib/mobile-social"
import { toggleVideoLike } from "@/lib/mobile-social"
import { getCurrentCustomerUser, getCustomerMedia } from "@/lib/customer-web"

export default async function PublicReelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewer = await getCurrentCustomerUser()
  const media = await getCustomerMedia(id, viewer?.userId)
  if (!media) return notFound()

  const post = media.video
  const images = post.images?.length ? post.images : post.imageUrl ? [post.imageUrl] : []
  const isImage = images.length > 0 && !post.videoUrl
  const caption = post.caption || post.description || post.title || "Shared on ChatAndTip"
  const ownPost = viewer?.userId === media.user.userId

  return (
    <CustomerShell active="" signedIn={Boolean(viewer)}>
      <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
        <section className="bg-neutral-950 text-white">
          {isImage ? (
            <div className="space-y-2 bg-black">
              {images.map((url) => <img key={url} src={url} alt={post.title || "ChatAndTip post"} className="w-full object-contain" />)}
            </div>
          ) : (
            <video src={post.videoUrl} poster={post.thumbnailUrl || undefined} controls playsInline className="aspect-[9/16] w-full bg-black object-contain" />
          )}
        </section>

        <section className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded-full bg-neutral-100">
                {media.user.profileAvatarUrl ? <Image src={media.user.profileAvatarUrl} alt="" fill sizes="48px" className="object-cover" /> : null}
              </div>
              <div className="min-w-0">
                <p className="truncate font-black">{media.user.fullname || "ChatAndTip creator"}</p>
                <p className="truncate text-xs text-neutral-500">{media.user.username ? `@${media.user.username}` : "Creator"}</p>
              </div>
            </div>
            {viewer && !ownPost ? (
              <form action={toggleFollow}>
                <input type="hidden" name="creatorId" value={media.user.userId} />
                <input type="hidden" name="mediaId" value={post.id} />
                <input type="hidden" name="next" value={media.following ? "false" : "true"} />
                <Button type="submit" variant={media.following ? "outline" : "default"} size="sm">{media.following ? "Following" : "Follow"}</Button>
              </form>
            ) : null}
          </div>

          {post.title ? <h1 className="text-2xl font-black">{post.title}</h1> : null}
          <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">{caption}</p>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-4">
            <div className="flex items-center gap-3">
              {viewer && !ownPost ? (
                <form action={toggleLike}>
                  <input type="hidden" name="ownerId" value={media.user.userId} />
                  <input type="hidden" name="mediaId" value={post.id} />
                  <Button type="submit" variant={post.isLiked ? "default" : "outline"} size="sm" className="gap-2"><Heart className="h-4 w-4" /> {post.isLiked ? "Liked" : "Like"}</Button>
                </form>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-neutral-600"><Heart className="h-4 w-4" />{post.likes.toLocaleString()}</span>
              )}
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-neutral-600"><MessageCircle className="h-4 w-4" />{post.commentCount.toLocaleString()}</span>
            </div>
            <ShareButton url={`/reels/${post.id}`} title={post.title || "ChatAndTip post"} text={`${media.user.fullname || "A creator"} on ChatAndTip`} />
          </div>
        </section>

        <section className="border-t border-black/5 p-5">
          <h2 className="font-black">Comments</h2>
          {viewer ? (
            <form action={addComment} className="mt-4 flex gap-3">
              <input type="hidden" name="mediaId" value={post.id} />
              <Textarea name="text" placeholder="Add a comment…" className="min-h-12 flex-1 resize-none" required />
              <Button type="submit" className="self-end">Post</Button>
            </form>
          ) : (
            <p className="mt-3 rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-500">Sign in to comment.</p>
          )}
          <div className="mt-5 space-y-4">
            {media.comments.map((comment) => (
              <article key={comment.id} className="flex gap-3">
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                  {comment.author.avatarUrl ? <Image src={comment.author.avatarUrl} alt="" fill sizes="36px" className="object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1 rounded-2xl bg-neutral-50 p-3">
                  <p className="text-sm font-black">{comment.author.name}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{comment.text}</p>
                  <p className="mt-2 text-xs text-neutral-400">{new Date(comment.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p>
                </div>
              </article>
            ))}
            {!media.comments.length ? <p className="py-6 text-center text-sm text-neutral-500">No comments yet.</p> : null}
          </div>
        </section>
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
  await followUser({ followerId: viewer.userId, followedId, follow: String(formData.get("next")) === "true" })
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
