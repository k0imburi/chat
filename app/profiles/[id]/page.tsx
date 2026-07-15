import { revalidatePath } from "next/cache"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { MessageCircle, PhoneCall, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CustomerShell } from "@/components/customer/customer-shell"
import { PostGrid } from "@/components/customer/post-grid"
import { ReportButton } from "@/components/customer/report-button"
import { VerifiedBadge } from "@/components/customer/verified-badge"
import { getCurrentCustomerUser, getCustomerProfile, type CustomerFeedEntry } from "@/lib/customer-web"
import { checkFollowStatus, followUser } from "@/lib/mobile-social"
import { reportUserAccount } from "@/lib/mobile-reports"

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [viewer, profile] = await Promise.all([getCurrentCustomerUser(), getCustomerProfile(id)])
  if (!profile) return notFound()

  const following =
    viewer && viewer.userId !== id
      ? await checkFollowStatus(viewer.userId, id)
          .then((r) => r.following)
          .catch(() => false)
      : false

  const isOwner = viewer?.userId === id
  const visibleGallery = isOwner
    ? profile.gallery
    : profile.gallery.filter((video) => !video.copyrightStatus && !video.reportStatus)
  const entries = visibleGallery.map((video) => ({ user: profile, video }) as CustomerFeedEntry)

  return (
    <CustomerShell active="" signedIn={Boolean(viewer)}>
      {/* Profile header */}
      <div className="mb-4 overflow-hidden rounded-3xl border border-white/10 bg-white/5">
        <div className="h-28 bg-gradient-to-br from-emerald-900/40 via-cyan-900/20 to-black/60" />
        <div className="px-5 pb-5">
          <div className="-mt-11 flex items-end justify-between gap-3">
            <div className="relative h-20 w-20 overflow-hidden rounded-2xl border-4 border-black bg-white/10 shadow">
              {profile.profileAvatarUrl ? (
                <Image src={profile.profileAvatarUrl} alt="" fill sizes="80px" className="object-cover" />
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 pb-1">
              {viewer && viewer.userId !== id ? (
                <form action={toggleProfileFollow}>
                  <input type="hidden" name="profileId" value={id} />
                  <input type="hidden" name="next" value={following ? "false" : "true"} />
                  <Button
                    type="submit"
                    variant={following ? "outline" : "default"}
                    size="sm"
                    className={following ? "rounded-full border-white/20 bg-transparent text-white hover:bg-white/10" : "rounded-full"}
                  >
                    {following ? "Following" : "Follow"}
                  </Button>
                </form>
              ) : null}
              <Link
                href={`/tip?creator=${profile.userId}&tier=PEBBLE`}
                className="rounded-full border border-emerald-700 px-3 py-1.5 text-xs font-bold text-emerald-400"
              >
                Tip
              </Link>
              {viewer && viewer.userId !== id ? (
                <>
                  <Link
                    href={`/book/${profile.userId}?type=VOICE`}
                    aria-label="Voice call"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/70"
                  >
                    <PhoneCall className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/book/${profile.userId}?type=VIDEO`}
                    aria-label="Video call"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/70"
                  >
                    <Video className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/inbox/${profile.userId}`}
                    aria-label="Message"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Link>
                  <ReportButton action={reportProfile.bind(null, id)} iconOnly />
                </>
              ) : null}
            </div>
          </div>

          <h1 className="mt-3 flex items-center gap-1.5 text-2xl font-black leading-tight">
            {profile.fullname || "ChatAndTip creator"}
            <VerifiedBadge verified={profile.verified} isBroadcaster={profile.isBroadcaster} className="h-5 w-5" />
          </h1>
          <p className="text-sm text-white/50">
            {profile.username ? `@${profile.username}` : "Creator"}
          </p>
          {profile.bio ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/70">{profile.bio}</p>
          ) : null}

          <div className="mt-4 flex gap-6 border-t border-white/10 pt-4 text-center">
            <StatItem label="Posts" value={profile.gallery.length} />
            <StatItem label="Followers" value={profile.followersCount ?? 0} />
            <StatItem label="Following" value={profile.followingCount ?? 0} />
          </div>
        </div>
      </div>

      {/* Posts grid */}
      <PostGrid entries={entries} empty="No posts yet." />
    </CustomerShell>
  )
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xl font-black tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs font-bold text-white/50">{label}</p>
    </div>
  )
}

async function toggleProfileFollow(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer) throw new Error("Sign in required")
  const followedId = String(formData.get("profileId") || "")
  await followUser({
    followerId: viewer.userId,
    followedId,
    follow: String(formData.get("next")) === "true",
  })
  revalidatePath(`/profiles/${followedId}`)
}

async function reportProfile(reportedUserId: string, formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer) throw new Error("Sign in required")
  const message = String(formData.get("message") || "").trim()
  if (!message) return
  await reportUserAccount({ reporterId: viewer.userId, reportedUserId, message })
}
