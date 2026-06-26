import { revalidatePath } from "next/cache"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CustomerShell } from "@/components/customer/customer-shell"
import { PostGrid } from "@/components/customer/post-grid"
import { getCurrentCustomerUser, getCustomerProfile, type CustomerFeedEntry } from "@/lib/customer-web"
import { checkFollowStatus, followUser } from "@/lib/mobile-social"

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

  const entries = profile.gallery.map((video) => ({ user: profile, video }) as CustomerFeedEntry)

  return (
    <CustomerShell active="" signedIn={Boolean(viewer)}>
      {/* Profile header */}
      <div className="mb-4 overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
        <div className="h-28 bg-gradient-to-br from-emerald-100 via-cyan-50 to-neutral-100" />
        <div className="px-5 pb-5">
          <div className="-mt-11 flex items-end justify-between gap-3">
            <div className="relative h-20 w-20 overflow-hidden rounded-2xl border-4 border-white bg-neutral-100 shadow">
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
                    className="rounded-full"
                  >
                    {following ? "Following" : "Follow"}
                  </Button>
                </form>
              ) : null}
              <Link
                href={`/tip?creator=${profile.userId}&tier=PEBBLE`}
                className="rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700"
              >
                Tip
              </Link>
              <Link
                href={`/book/${profile.userId}?type=VOICE`}
                className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-bold text-neutral-700"
              >
                Voice
              </Link>
              <Link
                href="/inbox"
                className="rounded-full bg-neutral-950 px-3 py-1.5 text-xs font-bold text-white"
              >
                Message
              </Link>
            </div>
          </div>

          <h1 className="mt-3 text-2xl font-black leading-tight">
            {profile.fullname || "ChatAndTip creator"}
          </h1>
          <p className="text-sm text-neutral-500">
            {profile.username ? `@${profile.username}` : "Creator"}
          </p>
          {profile.bio ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{profile.bio}</p>
          ) : null}

          <div className="mt-4 flex gap-6 border-t border-black/5 pt-4 text-center">
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
      <p className="text-xs font-bold text-neutral-500">{label}</p>
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
