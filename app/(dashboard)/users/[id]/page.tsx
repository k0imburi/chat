import Image from "next/image"
import { notFound } from "next/navigation"
import { Cake, CheckCircle2, Clock, LogIn, Mail, Monitor, Phone, User, CalendarDays, XCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { ActionForm } from "@/components/action-form"
import { prisma } from "@/lib/prisma"
import { formatCurrency, formatDateTime, formatRelative } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { deleteUserMediaAction, toggleUserVerificationAction, updateUserStatusAction } from "@/lib/actions/users"

const ACTIVITY_TAKE = 25

const counterpartySelect = { select: { id: true, fullName: true, username: true, avatarUrl: true } } as const

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await prisma.user.findUnique({ where: { id }, select: { fullName: true } })
  return { title: user?.fullName ?? id }
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      media: { orderBy: { createdAt: "desc" } },
      reportsAgainst: true,
      reportsMade: true,
      customerBookings: {
        orderBy: { scheduledStart: "desc" },
        take: ACTIVITY_TAKE,
        include: { creator: counterpartySelect },
      },
      creatorBookings: {
        orderBy: { scheduledStart: "desc" },
        take: ACTIVITY_TAKE,
        include: { customer: counterpartySelect },
      },
      sentTips: {
        orderBy: { createdAt: "desc" },
        take: ACTIVITY_TAKE,
        include: { receiver: counterpartySelect },
      },
      receivedTips: {
        orderBy: { createdAt: "desc" },
        take: ACTIVITY_TAKE,
        include: { sender: counterpartySelect },
      },
      creditPurchases: { orderBy: { createdAt: "desc" }, take: ACTIVITY_TAKE },
      tipPurchases: { orderBy: { createdAt: "desc" }, take: ACTIVITY_TAKE },
      creatorStrikes: { orderBy: { createdAt: "desc" } },
      creatorFines: {
        orderBy: { createdAt: "desc" },
        include: { booking: { include: { customer: counterpartySelect } } },
      },
      withdrawals: { orderBy: { createdAt: "desc" }, take: ACTIVITY_TAKE },
    },
  })

  if (!user) return notFound()

  // ── Calls: both directions, tagged with the role this user played ──
  const calls = [
    ...user.customerBookings.map((b) => ({
      id: b.id,
      scheduledStart: b.scheduledStart,
      type: b.type,
      status: b.status,
      role: "Customer" as const,
      counterparty: b.creator,
    })),
    ...user.creatorBookings.map((b) => ({
      id: b.id,
      scheduledStart: b.scheduledStart,
      type: b.type,
      status: b.status,
      role: "Creator" as const,
      counterparty: b.customer,
    })),
  ].sort((a, b) => b.scheduledStart.getTime() - a.scheduledStart.getTime())

  // ── Tips: sent + received, tagged with direction ──
  const tips = [
    ...user.sentTips.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      tier: t.tier,
      amountUsd: t.amountUsd,
      direction: "Sent" as const,
      counterparty: t.receiver,
    })),
    ...user.receivedTips.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      tier: t.tier,
      amountUsd: t.creatorAmountUsd,
      direction: "Received" as const,
      counterparty: t.sender,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  // ── Topups: credit purchases + tip purchases, both are "money in" events ──
  const topups = [
    ...user.creditPurchases.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      kind: "Credits" as const,
      amountKes: p.totalKes,
      provider: p.provider,
      status: p.status,
    })),
    ...user.tipPurchases.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      kind: "Tip purchase" as const,
      amountKes: p.totalKes,
      provider: p.provider,
      status: p.status,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const strikes = user.creatorStrikes
  const fines = user.creatorFines
  const withdrawals = user.withdrawals

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
            <ActionForm key={s} action={updateUserStatusAction}>
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
            </ActionForm>
          ))}
        </div>
        <ActionForm action={toggleUserVerificationAction}>
          <input type="hidden" name="userId" value={user.id} />
          <input type="hidden" name="verified" value={String(!user.verified)} />
          <Button type="submit" variant="outline" size="sm">
            {user.verified ? "Unverify" : "Verify"}
          </Button>
        </ActionForm>
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
                        <ActionForm action={deleteUserMediaAction}>
                          <input type="hidden" name="mediaId" value={item.id} />
                          <input type="hidden" name="userId" value={user.id} />
                          <Button type="submit" variant="destructive" size="sm">
                            Delete
                          </Button>
                        </ActionForm>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity — calls, tips, topups, strikes & fines, withdrawals */}
          <Card className="glass-panel rounded-lg border-0 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="calls">
                <TabsList>
                  <TabsTrigger value="calls">Calls ({calls.length})</TabsTrigger>
                  <TabsTrigger value="tips">Tips ({tips.length})</TabsTrigger>
                  <TabsTrigger value="topups">Topups ({topups.length})</TabsTrigger>
                  <TabsTrigger value="strikes">Strikes &amp; fines ({strikes.length + fines.length})</TabsTrigger>
                  <TabsTrigger value="withdrawals">Withdrawals ({withdrawals.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="calls">
                  {calls.length === 0 ? (
                    <EmptyRow label="No calls scheduled." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Scheduled</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>With</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calls.map((call) => (
                          <TableRow key={call.id}>
                            <TableCell className="text-muted-foreground">{formatDateTime(call.scheduledStart)}</TableCell>
                            <TableCell>{call.type}</TableCell>
                            <TableCell>{call.role}</TableCell>
                            <TableCell><CounterpartyCell person={call.counterparty} /></TableCell>
                            <TableCell><StatusBadge value={call.status} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="tips">
                  {tips.length === 0 ? (
                    <EmptyRow label="No tips sent or received." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Direction</TableHead>
                          <TableHead>With</TableHead>
                          <TableHead>Tier</TableHead>
                          <TableHead>Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tips.map((tip) => (
                          <TableRow key={tip.id}>
                            <TableCell className="text-muted-foreground">{formatDateTime(tip.createdAt)}</TableCell>
                            <TableCell>
                              <Badge variant={tip.direction === "Received" ? "default" : "outline"}>{tip.direction}</Badge>
                            </TableCell>
                            <TableCell><CounterpartyCell person={tip.counterparty} /></TableCell>
                            <TableCell>{toTitleCaseLocal(tip.tier)}</TableCell>
                            <TableCell>{formatCurrency(Number(tip.amountUsd), "USD")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="topups">
                  {topups.length === 0 ? (
                    <EmptyRow label="No topups on record." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Kind</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topups.map((topup) => (
                          <TableRow key={topup.id}>
                            <TableCell className="text-muted-foreground">{formatDateTime(topup.createdAt)}</TableCell>
                            <TableCell>{topup.kind}</TableCell>
                            <TableCell>{topup.provider}</TableCell>
                            <TableCell>{formatCurrency(Number(topup.amountKes), "KES")}</TableCell>
                            <TableCell><StatusBadge value={topup.status} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="strikes">
                  <div className="space-y-6">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Strikes ({strikes.length})
                      </p>
                      {strikes.length === 0 ? (
                        <EmptyRow label="No strikes on record." />
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Reason</TableHead>
                              <TableHead>Expires</TableHead>
                              <TableHead>State</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {strikes.map((strike) => {
                              const active = !strike.consumedAt && (!strike.expiresAt || strike.expiresAt > new Date())
                              return (
                                <TableRow key={strike.id}>
                                  <TableCell className="text-muted-foreground">{formatDateTime(strike.createdAt)}</TableCell>
                                  <TableCell>{strike.reason}</TableCell>
                                  <TableCell className="text-muted-foreground">{formatDateTime(strike.expiresAt)}</TableCell>
                                  <TableCell>
                                    <Badge variant={active ? "destructive" : "outline"}>
                                      {strike.consumedAt ? "Consumed" : active ? "Active" : "Expired"}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Fines ({fines.length})
                      </p>
                      {fines.length === 0 ? (
                        <EmptyRow label="No fines on record." />
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>With</TableHead>
                              <TableHead>Reason</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fines.map((fine) => (
                              <TableRow key={fine.id}>
                                <TableCell className="text-muted-foreground">{formatDateTime(fine.createdAt)}</TableCell>
                                <TableCell><CounterpartyCell person={fine.booking.customer} /></TableCell>
                                <TableCell>{fine.reason}</TableCell>
                                <TableCell>{formatCurrency(Number(fine.amount), fine.currency)}</TableCell>
                                <TableCell><StatusBadge value={fine.status} /></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="withdrawals">
                  {withdrawals.length === 0 ? (
                    <EmptyRow label="No withdrawals on record." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {withdrawals.map((w) => (
                          <TableRow key={w.id}>
                            <TableCell className="text-muted-foreground">{formatDateTime(w.createdAt)}</TableCell>
                            <TableCell>{w.method}</TableCell>
                            <TableCell>{w.destination}</TableCell>
                            <TableCell>{formatCurrency(Number(w.amount), "USD")}</TableCell>
                            <TableCell><StatusBadge value={w.status} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
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

function EmptyRow({ label }: { label: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{label}</p>
}

type CounterpartyPerson = { fullName: string; username: string | null; avatarUrl: string | null } | null

function CounterpartyCell({ person }: { person: CounterpartyPerson }) {
  if (!person) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full bg-muted">
        {person.avatarUrl ? (
          <Image src={person.avatarUrl} alt={person.fullName} fill className="object-cover" />
        ) : null}
      </div>
      <span className="truncate text-sm">{person.username ? `@${person.username}` : person.fullName}</span>
    </div>
  )
}

function toTitleCaseLocal(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase()
}
