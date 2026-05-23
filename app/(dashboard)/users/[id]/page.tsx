import Image from "next/image"
import { notFound } from "next/navigation"
import { Cake, CheckCircle2, Clock, LogIn, Mail, Monitor, Phone, User, CalendarDays, XCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { formatDateTime, formatRelative } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { deleteUserMediaAction, toggleUserVerificationAction, updateUserStatusAction } from "@/lib/actions/users"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await prisma.user.findUnique({ where: { id }, select: { fullName: true } })
  return { title: user?.fullName ?? id }
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id },
    include: { media: { orderBy: { createdAt: "desc" } }, reportsAgainst: true, reportsMade: true },
  })

  if (!user) notFound()

  const profileVideo = user.media.find((m) => m.kind === "PROFILE_VIDEO")
  const gallery = user.media.filter((m) => m.kind !== "PROFILE_VIDEO")
  const loginProvider = user.loginProvider.replace(/_/g, " ")
  const location = [user.city, user.country].filter(Boolean).join(", ") || "—"
  const profileAvatar = user.avatarUrl || profileVideo?.thumbnailUrl || profileVideo?.url
  const initials = user.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="space-y-6">
      {/* Moderation actions — top right */}
      <div className="flex items-center justify-end gap-2">
        <div className="flex overflow-hidden rounded-lg border border-border">
          {(["ACTIVE", "BLOCKED", "REPORTED", "HIDDEN"] as const).map((s) => (
            <form key={s} action={updateUserStatusAction}>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="status" value={s} />
              <Button
                type="submit"
                variant={user.status === s ? "default" : "ghost"}
                size="sm"
                className="rounded-none border-0 border-r border-border last:border-r-0"
              >
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </Button>
            </form>
          ))}
        </div>
        <form action={toggleUserVerificationAction}>
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="verified" value={String(!user.verified)} />
          <Button type="submit" variant="outline" size="sm">
            {user.verified ? "Unverify" : "Verify"}
          </Button>
        </form>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ── Sticky sidebar ── */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit lg:w-80 lg:shrink-0">
          {/* Identity card */}
          <Card className="glass-panel overflow-hidden rounded-lg border-0 shadow-none">
            <CardContent className="pt-6">
              {/* Avatar */}
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-4 h-24 w-24 overflow-hidden rounded-lg bg-muted">
                  {profileAvatar ? (
                    <Image src={profileAvatar} alt={user.fullName} fill className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-muted-foreground">
                      {initials}
                    </div>
                  )}
                </div>
                <h2 className="text-lg font-semibold leading-snug">{user.fullName}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{location}</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <StatusBadge value={user.status} />
                  {user.verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      <XCircle className="h-3 w-3" /> Unverified
                    </span>
                  )}
                </div>
              </div>

              {/* Quick stats */}
              <div className="mt-5 grid grid-cols-3 divide-x divide-border/60 border-t border-border/60 pt-4">
                {[
                  { label: "Swipes", value: user.swipeCount },
                  { label: "Reports", value: user.reportsAgainst.length },
                  { label: "Media", value: user.media.length },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col items-center gap-0.5 px-2">
                    <span className="text-xl font-semibold tabular-nums">{value}</span>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Personal info card */}
          <Card className="glass-panel rounded-lg border-0 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SideSection label="Contact">
                <SideRow icon={Mail} label="Email" value={user.email || "—"} />
                <SideRow icon={Phone} label="Phone" value={user.phoneNumber || "—"} />
              </SideSection>
              <SideSection label="Personal">
                <SideRow icon={User} label="Gender" value={user.gender || "—"} />
                <SideRow icon={Cake} label="Birthday" value={user.birthday ? formatDateTime(user.birthday) : "—"} />
              </SideSection>
              <SideSection label="Account">
                <SideRow icon={LogIn} label="Login via" value={loginProvider} />
                <SideRow icon={Monitor} label="Device" value={user.deviceSystem || "—"} />
                <SideRow icon={CalendarDays} label="Joined" value={formatDateTime(user.createdAt)} />
                <SideRow icon={Clock} label="Last active" value={formatRelative(user.lastActiveAt ?? user.createdAt)} />
              </SideSection>
              {Array.isArray(user.interests) && user.interests.length > 0 && (
                <SideSection label="Interests">
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {user.interests.map((interest) => (
                      <span key={String(interest)} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                        {String(interest)}
                      </span>
                    ))}
                  </div>
                </SideSection>
              )}
            </CardContent>
          </Card>

        </aside>

        {/* ── Scrollable main ── */}
        <main className="min-w-0 flex-1 space-y-4">
          {/* Media */}
          <Card className="glass-panel rounded-lg border-0 shadow-none">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>Media</CardTitle>
                <span className="text-sm text-muted-foreground">
                  {user.media.length} {user.media.length === 1 ? "file" : "files"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {profileVideo ? (
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <div className="relative aspect-video bg-muted">
                    <Image
                      src={profileVideo.thumbnailUrl || profileVideo.url}
                      alt={user.fullName}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-sm">
                    <p className="font-medium">Profile video</p>
                    <p className="text-muted-foreground">{profileVideo.views} views</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">
                  No profile video uploaded.
                </div>
              )}

              {gallery.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {gallery.map((item) => (
                    <div key={item.id} className="overflow-hidden rounded-lg border border-border/60">
                      <div className="relative aspect-video bg-muted">
                        <Image
                          src={item.thumbnailUrl || item.url}
                          alt={item.title || user.fullName}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.title || "Gallery media"}</p>
                          <p className="text-xs text-muted-foreground">{item.mimeType || "—"}</p>
                        </div>
                        <form action={deleteUserMediaAction}>
                          <input type="hidden" name="mediaId" value={item.id} />
                          <input type="hidden" name="userId" value={user.id} />
                          <Button type="submit" variant="destructive" size="sm">
                            Delete
                          </Button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reports — only rendered when present */}
          {user.reportsAgainst.length > 0 && (
            <Card className="glass-panel rounded-lg border-0 shadow-none">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2.5">
                  <CardTitle>Reports</CardTitle>
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                    {user.reportsAgainst.length}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="divide-y divide-border/60">
                {user.reportsAgainst.map((report) => (
                  <div key={report.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm leading-relaxed">{report.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(report.createdAt)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  )
}

function SideSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{label}</p>
      {children}
    </div>
  )
}

function SideRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-1 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium leading-tight">{value}</p>
      </div>
    </div>
  )
}
