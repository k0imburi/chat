import { revalidatePath } from "next/cache"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import { CustomerShell } from "@/components/customer/customer-shell"
import { MediaCard } from "@/components/customer/media-card"
import { getCurrentCustomerUser, getCustomerProfile, type CustomerFeedEntry } from "@/lib/customer-web"
import { checkFollowStatus, followUser } from "@/lib/mobile-social"

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [viewer, profile] = await Promise.all([getCurrentCustomerUser(), getCustomerProfile(id)])
  if (!profile) return notFound()
  const following = viewer && viewer.userId !== id ? await checkFollowStatus(viewer.userId, id).then((r) => r.following).catch(() => false) : false
  const entries = profile.gallery.map((video) => ({ user: profile, video }) as CustomerFeedEntry)

  return (
    <CustomerShell active="" signedIn={Boolean(viewer)}>
      <section className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
        <div className="h-32 bg-gradient-to-br from-emerald-200 via-cyan-100 to-neutral-100" />
        <div className="px-5 pb-6">
          <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-neutral-100 shadow">
              {profile.profileAvatarUrl ? <Image src={profile.profileAvatarUrl} alt="" fill sizes="96px" className="object-cover" /> : null}
            </div>
            <div className="flex gap-2">
              {viewer && viewer.userId !== id ? (
                <form action={toggleProfileFollow}>
                  <input type="hidden" name="profileId" value={id} />
                  <input type="hidden" name="next" value={following ? "false" : "true"} />
                  <Button type="submit" variant={following ? "outline" : "default"}>{following ? "Following" : "Follow"}</Button>
                </form>
              ) : null}
              <Link href={`/tip?creator=${profile.userId}&tier=PEBBLE`} className="rounded-full border border-emerald-200 px-4 py-2 text-sm font-bold text-emerald-700">Tip</Link>
              <Link href={`/book/${profile.userId}?type=VOICE`} className="rounded-full border border-blue-200 px-4 py-2 text-sm font-bold text-blue-700">Voice</Link>
              <Link href={`/book/${profile.userId}?type=VIDEO`} className="rounded-full border border-purple-200 px-4 py-2 text-sm font-bold text-purple-700">Video</Link>
              <Link href="/inbox" className="rounded-full bg-neutral-950 px-4 py-2 text-sm font-bold text-white">Message</Link>
            </div>
          </div>
          <h1 className="mt-4 text-3xl font-black">{profile.fullname || "ChatAndTip creator"}</h1>
          <p className="text-sm text-neutral-500">{profile.username ? `@${profile.username}` : "Creator"}</p>
          {profile.bio ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{profile.bio}</p> : null}
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <Stat label="Posts" value={profile.gallery.length} />
            <Stat label="Followers" value={profile.followersCount ?? 0} />
            <Stat label="Following" value={profile.followingCount ?? 0} />
          </div>
        </div>
      </section>

      <div className="mt-6 space-y-5">
        {entries.map((entry) => <MediaCard key={entry.video.id} entry={entry} />)}
        {!entries.length ? <div className="rounded-3xl border border-black/5 bg-white p-8 text-center text-sm text-neutral-500 shadow-sm">No posts yet.</div> : null}
      </div>
    </CustomerShell>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-neutral-50 p-3"><p className="text-xl font-black tabular-nums">{value.toLocaleString()}</p><p className="text-xs font-bold text-neutral-500">{label}</p></div>
}

async function toggleProfileFollow(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  if (!viewer) throw new Error("Sign in required")
  const followedId = String(formData.get("profileId") || "")
  await followUser({ followerId: viewer.userId, followedId, follow: String(formData.get("next")) === "true" })
  revalidatePath(`/profiles/${followedId}`)
}
