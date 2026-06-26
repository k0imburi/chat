import Image from "next/image"
import Link from "next/link"
import { Heart, MessageCircle, Play } from "lucide-react"
import { ShareButton } from "@/components/customer/share-button"
import type { CustomerFeedEntry } from "@/lib/customer-web"

export function MediaCard({ entry }: { entry: CustomerFeedEntry }) {
  const post = entry.video
  const creator = entry.user
  const image = post.imageUrl || post.thumbnailUrl || post.images[0] || ""
  const isVideo = Boolean(post.videoUrl)
  const caption = post.caption || post.description || post.title || "Shared on ChatAndTip"
  const shareUrl = `/reels/${post.id}`

  return (
    <article className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
      <div className="flex items-center gap-3 p-4">
        <Link href={`/profiles/${creator.userId}`} className="relative h-11 w-11 overflow-hidden rounded-full bg-neutral-100">
          {creator.profileAvatarUrl ? <Image src={creator.profileAvatarUrl} alt="" fill sizes="44px" className="object-cover" /> : null}
        </Link>
        <div className="min-w-0">
          <Link href={`/profiles/${creator.userId}`} className="block truncate font-extrabold hover:text-emerald-700">{creator.fullname || "ChatAndTip creator"}</Link>
          <p className="truncate text-xs text-neutral-500">{creator.username ? `@${creator.username}` : "Creator"}</p>
        </div>
      </div>

      <Link href={shareUrl} className="group relative block bg-black">
        {image ? (
          <img src={image} alt={post.title || caption} className="max-h-[720px] min-h-[320px] w-full object-contain" />
        ) : (
          <div className="flex aspect-[9/12] items-center justify-center bg-neutral-900 text-white/50">Media unavailable</div>
        )}
        {isVideo ? (
          <span className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition group-hover:scale-105">
            <Play className="ml-1 h-7 w-7 fill-current" />
          </span>
        ) : null}
      </Link>

      <div className="space-y-3 p-4">
        {post.title ? <h2 className="text-lg font-black">{post.title}</h2> : null}
        <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">{caption}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-3">
          <div className="flex items-center gap-4 text-sm font-bold text-neutral-600">
            <span className="inline-flex items-center gap-1.5"><Heart className="h-4 w-4" />{post.likes.toLocaleString()}</span>
            <span className="inline-flex items-center gap-1.5"><MessageCircle className="h-4 w-4" />{post.commentCount.toLocaleString()}</span>
          </div>
          <ShareButton url={shareUrl} title={post.title || "ChatAndTip post"} text={`${creator.fullname || "A creator"} on ChatAndTip`} />
        </div>
      </div>
    </article>
  )
}

export function FeedList({ entries, empty }: { entries: CustomerFeedEntry[]; empty: string }) {
  if (!entries.length) {
    return <div className="rounded-3xl border border-black/5 bg-white p-8 text-center text-sm text-neutral-500 shadow-sm">{empty}</div>
  }
  return <div className="space-y-5">{entries.map((entry) => <MediaCard key={entry.video.id} entry={entry} />)}</div>
}
