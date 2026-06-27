import { revalidatePath } from "next/cache"
import { AlertTriangle, BadgeCheck, ScanFace, ShieldQuestion } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { reviewLivenessVerificationAction } from "@/lib/actions/monetization"
import { prisma } from "@/lib/prisma"

const badgeStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  NOT_SUBMITTED: "bg-neutral-100 text-neutral-700",
}

function similarityColor(sim: number | null) {
  if (sim === null) return "bg-neutral-100 text-neutral-700"
  if (sim >= 95) return "bg-emerald-100 text-emerald-800"
  if (sim >= 40) return "bg-amber-100 text-amber-900"
  return "bg-rose-100 text-rose-800"
}

function formatDate(d: Date | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default async function FaceVerificationsPage() {
  let migrationRequired = false
  let rows: Awaited<ReturnType<typeof loadQueue>> = []
  try {
    rows = await loadQueue()
  } catch {
    migrationRequired = true
  }

  const pending = rows.filter((r) => r.status === "PENDING").length
  const approved = rows.filter((r) => r.status === "APPROVED").length
  const rejected = rows.filter((r) => r.status === "REJECTED").length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trust & safety"
        title="Face verifications"
        description="Review live-selfie submissions. Auto-approved at ≥95% match; everything else queues here."
      />

      {migrationRequired ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Database migration required — run <code className="font-mono font-bold">npx prisma db push</code> to create the liveness verification table.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Pending review" value={pending} icon={<ShieldQuestion className="h-5 w-5 text-amber-700" />} />
        <SummaryCard label="Approved" value={approved} icon={<BadgeCheck className="h-5 w-5 text-emerald-700" />} />
        <SummaryCard label="Rejected" value={rejected} icon={<AlertTriangle className="h-5 w-5 text-rose-700" />} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <ScanFace className="h-5 w-5" />
          <h2 className="font-semibold">Latest face verification submissions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Submitted</th>
                <th className="px-5 py-3">Live selfie</th>
                <th className="px-5 py-3">Profile photo</th>
                <th className="px-5 py-3">Match</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => {
                const sim = row.similarity ? Number(row.similarity) : null
                return (
                  <tr key={row.id} className="align-top hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <p className="font-medium">{row.user.fullName || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">{row.user.email || row.user.phoneNumber || row.user.id}</p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{formatDate(row.submittedAt || row.createdAt)}</td>
                    <td className="px-5 py-4">
                      {row.liveSelfieObjectKey ? (
                        <a
                          href={`/api/admin/private-file?key=${encodeURIComponent(row.liveSelfieObjectKey)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/admin/private-file?key=${encodeURIComponent(row.liveSelfieObjectKey)}`}
                            alt="Live selfie"
                            className="h-24 w-24 rounded-lg object-cover ring-1 ring-border"
                          />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">No selfie</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {row.user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.user.avatarUrl} alt="Profile photo" className="h-24 w-24 rounded-lg object-cover ring-1 ring-border" />
                      ) : (
                        <span className="text-xs text-muted-foreground">No avatar</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${similarityColor(sim)}`}>
                        {sim !== null ? `${sim.toFixed(1)}%` : "—"}
                      </span>
                      {row.reviewNote ? <p className="mt-1 max-w-[180px] text-xs text-muted-foreground">{row.reviewNote}</p> : null}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeStyles[row.status] || badgeStyles.NOT_SUBMITTED}`}>
                        {row.status.replaceAll("_", " ")}
                      </span>
                      {row.rejectionReason ? <p className="mt-1 max-w-xs text-xs text-rose-700">{row.rejectionReason}</p> : null}
                    </td>
                    <td className="px-5 py-4">
                      {row.status === "PENDING" ? (
                        <div className="grid min-w-[280px] gap-2">
                          <form action={approveLiveness} className="inline-flex">
                            <input type="hidden" name="userId" value={row.userId} />
                            <Button size="sm" type="submit">Approve</Button>
                          </form>
                          <form action={rejectLiveness} className="space-y-2">
                            <input type="hidden" name="userId" value={row.userId} />
                            <Textarea name="reason" placeholder="Rejection reason shown to the user" className="min-h-20" required />
                            <Button size="sm" variant="destructive" type="submit">Reject</Button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Reviewed {formatDate(row.reviewedAt)}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                    No face verification submissions yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

async function approveLiveness(formData: FormData) {
  "use server"
  await reviewLivenessVerificationAction({ userId: String(formData.get("userId") || ""), approved: true })
  revalidatePath("/face-verifications")
}

async function rejectLiveness(formData: FormData) {
  "use server"
  await reviewLivenessVerificationAction({
    userId: String(formData.get("userId") || ""),
    approved: false,
    reason: String(formData.get("reason") || "Verification was not approved"),
  })
  revalidatePath("/face-verifications")
}

function loadQueue() {
  return prisma.livenessVerification.findMany({
    orderBy: [{ status: "desc" }, { submittedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: { user: { select: { id: true, fullName: true, email: true, phoneNumber: true, avatarUrl: true } } },
  })
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">Latest 100 submissions</p>
    </div>
  )
}
