import { revalidatePath } from "next/cache"
import { AlertTriangle, BadgeCheck, FileCheck2, ShieldQuestion } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { reviewCreatorKycAction } from "@/lib/actions/monetization"
import { prisma } from "@/lib/prisma"

const badgeStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  NOT_SUBMITTED: "bg-neutral-100 text-neutral-700",
}

export default async function CreatorVerificationsPage() {
  let migrationRequired = false
  let rows: Awaited<ReturnType<typeof loadKycQueue>> = []
  try {
    rows = await loadKycQueue()
  } catch {
    migrationRequired = true
  }

  const pending = rows.filter((row) => row.status === "PENDING").length
  const approved = rows.filter((row) => row.status === "APPROVED").length
  const rejected = rows.filter((row) => row.status === "REJECTED").length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trust & payouts"
        title="Creator KYC review"
        description="Approve private ID/selfie submissions before automatic M-PESA creator payouts are allowed."
      />

      {migrationRequired ? <MigrationNotice label="creator verification" /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Pending review" value={pending} icon={<ShieldQuestion className="h-5 w-5 text-amber-700" />} />
        <SummaryCard label="Approved" value={approved} icon={<BadgeCheck className="h-5 w-5 text-emerald-700" />} />
        <SummaryCard label="Rejected" value={rejected} icon={<AlertTriangle className="h-5 w-5 text-rose-700" />} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <FileCheck2 className="h-5 w-5" />
          <h2 className="font-semibold">Latest verification submissions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Creator</th>
                <th className="px-5 py-3">Submitted</th>
                <th className="px-5 py-3">Documents</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-muted/30">
                  <td className="px-5 py-4">
                    <p className="font-medium">{row.user.fullName || "Unnamed account"}</p>
                    <p className="text-xs text-muted-foreground">{row.user.email || row.user.phoneNumber || row.user.id}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{formatDate(row.submittedAt || row.createdAt)}</td>
                  <td className="px-5 py-4">
                    <DocumentKey label="ID front" value={row.idFrontObjectKey} />
                    <DocumentKey label="ID back" value={row.idBackObjectKey} />
                    <DocumentKey label="Selfie" value={row.selfieObjectKey} />
                  </td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeStyles[row.status] || badgeStyles.NOT_SUBMITTED}`}>
                      {row.status.replaceAll("_", " ")}
                    </span>
                    {row.rejectionReason ? <p className="mt-2 max-w-xs text-xs text-rose-700">{row.rejectionReason}</p> : null}
                  </td>
                  <td className="px-5 py-4">
                    {row.status === "PENDING" ? (
                      <div className="grid min-w-[280px] gap-2">
                        <form action={approveKyc} className="inline-flex">
                          <input type="hidden" name="userId" value={row.userId} />
                          <Button size="sm" type="submit">Approve</Button>
                        </form>
                        <form action={rejectKyc} className="space-y-2">
                          <input type="hidden" name="userId" value={row.userId} />
                          <Textarea name="reason" placeholder="Rejection reason shown to the creator" className="min-h-20" required />
                          <Button size="sm" variant="destructive" type="submit">Reject</Button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Reviewed {formatDate(row.reviewedAt)}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">No verification submissions yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

async function approveKyc(formData: FormData) {
  "use server"
  await reviewCreatorKycAction({ userId: String(formData.get("userId") || ""), approved: true })
  revalidatePath("/creator-verifications")
}

async function rejectKyc(formData: FormData) {
  "use server"
  await reviewCreatorKycAction({
    userId: String(formData.get("userId") || ""),
    approved: false,
    reason: String(formData.get("reason") || "Verification was not approved"),
  })
  revalidatePath("/creator-verifications")
}

function loadKycQueue() {
  return prisma.creatorKyc.findMany({
    orderBy: [{ status: "desc" }, { submittedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: { user: { select: { id: true, fullName: true, email: true, phoneNumber: true } } },
  })
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p>{icon}</div>
      <p className="mt-3 text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">Latest 100 submissions</p>
    </div>
  )
}

function DocumentKey({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return (
      <p className="max-w-sm truncate text-xs">
        <span className="font-semibold text-foreground">{label}:</span>{" "}
        <span className="font-mono text-muted-foreground">missing</span>
      </p>
    )
  }

  return (
    <div className="flex max-w-sm items-center gap-2 text-xs">
      <span className="font-semibold text-foreground">{label}:</span>
      <a
        href={`/api/admin/private-file?key=${encodeURIComponent(value)}`}
        target="_blank"
        rel="noreferrer"
        className="rounded-full bg-muted px-2.5 py-1 font-bold text-foreground hover:bg-muted/80"
      >
        View
      </a>
      <span className="min-w-0 truncate font-mono text-muted-foreground">{value}</span>
    </div>
  )
}

function MigrationNotice({ label }: { label: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div><p className="font-bold">Staging migration required</p><p className="mt-1 text-amber-800">The {label} tables are not available in this database yet. Apply the monetization migration on staging before using this queue.</p></div>
    </div>
  )
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "—"
}
