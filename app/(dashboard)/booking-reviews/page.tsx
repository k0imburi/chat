import { revalidatePath } from "next/cache"
import { AlertTriangle, CalendarClock, PhoneCall, ShieldAlert, Video } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { reviewEarlyEndedBookingAction } from "@/lib/actions/monetization"
import { prisma } from "@/lib/prisma"

export default async function BookingReviewsPage() {
  let migrationRequired = false
  let rows: Awaited<ReturnType<typeof loadBookingReviews>> = []
  try {
    rows = await loadBookingReviews()
  } catch {
    migrationRequired = true
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sessions"
        title="Call dispute reviews"
        description="Resolve creator-ended-early sessions by either releasing the reserved credit to the user or settling the session to the creator."
      />

      {migrationRequired ? <MigrationNotice label="booking review" /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Under review" value={rows.length} icon={<ShieldAlert className="h-5 w-5 text-amber-700" />} />
        <SummaryCard label="Voice" value={rows.filter((row) => row.type === "VOICE").length} icon={<PhoneCall className="h-5 w-5 text-blue-700" />} />
        <SummaryCard label="Video" value={rows.filter((row) => row.type === "VIDEO").length} icon={<Video className="h-5 w-5 text-purple-700" />} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <CalendarClock className="h-5 w-5" />
          <h2 className="font-semibold">Early-ended sessions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-5 py-3">Scheduled</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Creator</th><th className="px-5 py-3">Join state</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Decision</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-muted/30">
                  <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{formatDate(row.scheduledStart)}</td>
                  <td className="px-5 py-4">{row.type}</td>
                  <td className="px-5 py-4"><UserCell user={row.customer} /></td>
                  <td className="px-5 py-4"><UserCell user={row.creator} /></td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    <p>Customer: {formatDate(row.customerJoinedAt)}</p>
                    <p>Creator: {formatDate(row.creatorJoinedAt)}</p>
                  </td>
                  <td className="px-5 py-4"><p className="max-w-sm text-sm">{row.endReason || "Creator ended early"}</p></td>
                  <td className="px-5 py-4">
                    <div className="grid min-w-[300px] gap-3">
                      <form action={refundUser} className="space-y-2">
                        <input type="hidden" name="bookingId" value={row.id} />
                        <Textarea name="decision" placeholder="Decision note for refund/release" className="min-h-16" required />
                        <Button size="sm" variant="outline" type="submit">Release session to user</Button>
                      </form>
                      <form action={payCreator} className="space-y-2">
                        <input type="hidden" name="bookingId" value={row.id} />
                        <Textarea name="decision" placeholder="Decision note for creator settlement" className="min-h-16" required />
                        <Button size="sm" type="submit">Settle to creator</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No sessions are under review.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

async function refundUser(formData: FormData) {
  "use server"
  await reviewEarlyEndedBookingAction({
    bookingId: String(formData.get("bookingId") || ""),
    releaseToCreator: false,
    decision: String(formData.get("decision") || "Released to user by administrator"),
  })
  revalidatePath("/booking-reviews")
}

async function payCreator(formData: FormData) {
  "use server"
  await reviewEarlyEndedBookingAction({
    bookingId: String(formData.get("bookingId") || ""),
    releaseToCreator: true,
    decision: String(formData.get("decision") || "Settled to creator by administrator"),
  })
  revalidatePath("/booking-reviews")
}

function loadBookingReviews() {
  return prisma.callBooking.findMany({
    where: { status: "UNDER_REVIEW" },
    orderBy: { completedAt: "asc" },
    take: 100,
    include: {
      customer: { select: { fullName: true, email: true, phoneNumber: true } },
      creator: { select: { fullName: true, email: true, phoneNumber: true } },
    },
  })
}

function UserCell({ user }: { user: { fullName: string | null; email: string | null; phoneNumber: string | null } }) {
  return <div><p className="font-medium">{user.fullName || "Unnamed account"}</p><p className="text-xs text-muted-foreground">{user.email || user.phoneNumber || "—"}</p></div>
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p>{icon}</div><p className="mt-3 text-3xl font-bold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">Latest 100 reviews</p></div>
}

function MigrationNotice({ label }: { label: string }) {
  return <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Staging migration required</p><p className="mt-1 text-amber-800">The {label} tables are not available in this database yet. Apply the monetization migration on staging before using this queue.</p></div></div>
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "—"
}
