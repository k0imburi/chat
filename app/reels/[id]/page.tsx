import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Heart } from "lucide-react"
import { FeedShell } from "@/components/customer/feed-shell"
import { ImageCarousel } from "@/components/customer/image-carousel"
import { ShareButton } from "@/components/customer/share-button"
import { ReelCommentButton } from "@/components/customer/reel-comment-button"
import { LikeButton, FollowButton } from "@/components/customer/reel-actions"
import { ReportButton } from "@/components/customer/report-button"
import { VerifiedBadge } from "@/components/customer/verified-badge"
import { getCurrentCustomerUser, getCustomerMedia } from "@/lib/customer-web"
import { prisma } from "@/lib/prisma"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const media = await getCustomerMedia(id)
  if (!media) return {}
  const title = media.video.title || media.video.caption || "ChatAndTip post"
  const description =
    media.video.description || media.video.caption || `${media.user.fullname || "A creator"} on ChatAndTip`
  const image = media.video.thumbnailUrl || media.video.imageUrl || undefined

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image ? [{ url: image, width: 1080, height: 1080 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

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
    createdAt: c.createdAt,
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
                <span className="absolute -bottom-1.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white">
                  +
                </span>
              )}
            </Link>

            {!ownPost ? (
              <LikeButton
                viewerId={viewer?.userId}
                ownerId={media.user.userId}
                mediaId={post.id}
                initialLiked={Boolean(post.isLiked)}
                initialLikes={post.likes}
              />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <div className="flex h-12 w-12 items-center justify-center">
                  <Heart className="h-[26px] w-[26px] text-white" />
                </div>
                <span className="text-xs font-bold text-white">{post.likes.toLocaleString()}</span>
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

            {!ownPost && viewer ? (
              <ReportButton action={reportUser.bind(null, media.user.userId)} />
            ) : null}
          </div>

          {/* Bottom info */}
          <div className="absolute bottom-20 left-4 right-20 space-y-1.5">
            <div className="flex items-center gap-3">
              <Link href={`/profiles/${media.user.userId}`} className="flex items-center gap-1.5">
                <p className="text-[15px] font-black text-white">{handle}</p>
                <VerifiedBadge verified={media.user.verified} isBroadcaster={media.user.isBroadcaster} />
              </Link>
              {!ownPost ? (
                <FollowButton
                  viewerId={viewer?.userId}
                  followedId={media.user.userId}
                  initialFollowing={media.following}
                />
              ) : null}
            </div>
            {caption ? (
              <p className="line-clamp-2 text-sm leading-5 text-white/90">{caption}</p>
            ) : null}
          </div>
        </div>
      </div>
    </FeedShell>
  )
}

async function reportUser(reportedUserId: string, formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer) throw new Error("Sign in required")
  const message = String(formData.get("message") || "").trim()
  if (!message) return
  await prisma.report.create({
    data: { message, reportedUserId, reportedById: viewer.userId },
  })
  await prisma.user.update({ where: { id: reportedUserId }, data: { status: "REPORTED" } })
}
