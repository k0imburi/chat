import { AlertTriangle, BanknoteArrowUp, CirclePause, Landmark, WalletCards } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { prisma } from "@/lib/prisma"

const statusStyles: Record<string, string> = {
  PENDING: "bg-neutral-100 text-neutral-700",
  PROCESSING: "bg-sky-100 text-sky-800",
  SUCCEEDED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-rose-100 text-rose-800",
}

export default async function CreatorPayoutsPage() {
  let migrationRequired = false
  let data: Awaited<ReturnType<typeof loadPayoutData>> = { payouts: [], pausedProfiles: [] }
  try {
    data = await loadPayoutData()
  } catch {
    migrationRequired = true
  }

  const processingKes = data.payouts.filter((row) => row.status === "PROCESSING").reduce((sum, row) => sum + Number(row.amount), 0)
  const failed = data.payouts.filter((row) => row.status === "FAILED").length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Creator payouts"
        description="Monitor automatic M-PESA B2C payouts, reserved earning lots, provider references and paused payout profiles."
      />

      {migrationRequired ? <MigrationNotice label="creator payout" /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Processing value" value={`KES ${processingKes.toFixed(2)}`} icon={<BanknoteArrowUp className="h-5 w-5 text-sky-700" />} />
        <SummaryCard label="Failed attempts" value={failed.toLocaleString()} icon={<AlertTriangle className="h-5 w-5 text-rose-700" />} />
        <SummaryCard label="Paused profiles" value={data.pausedProfiles.length.toLocaleString()} icon={<CirclePause className="h-5 w-5 text-amber-700" />} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <Landmark className="h-5 w-5" />
          <h2 className="font-semibold">Latest payouts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-5 py-3">Created</th><th className="px-5 py-3">Creator</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Destination</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Failure</th></tr>
            </thead>
            <tbody className="divide-y">
              {data.payouts.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{formatDate(row.createdAt)}</td>
                  <td className="px-5 py-4"><UserCell user={row.user} /></td>
                  <td className="px-5 py-4 font-semibold tabular-nums">{row.currency} {Number(row.amount).toFixed(2)}</td>
                  <td className="px-5 py-4 font-mono text-xs">{mask(row.destination)}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[row.status] || statusStyles.PENDING}`}>{row.status.replaceAll("_", " ")}</span></td>
                  <td className="px-5 py-4 font-mono text-xs">{mask(row.providerReference)}</td>
                  <td className="px-5 py-4"><p className="max-w-sm text-xs text-muted-foreground">{row.failureReason || "—"}</p></td>
                </tr>
              ))}
              {!data.payouts.length ? <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No creator payouts have been created yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <WalletCards className="h-5 w-5" />
          <h2 className="font-semibold">Paused payout profiles</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-5 py-3">Creator</th><th className="px-5 py-3">Destination</th><th className="px-5 py-3">Verified</th><th className="px-5 py-3">Reason</th></tr>
            </thead>
            <tbody className="divide-y">
              {data.pausedProfiles.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-5 py-4"><UserCell user={row.user} /></td>
                  <td className="px-5 py-4 font-mono text-xs">{mask(row.mpesaPhone)}</td>
                  <td className="px-5 py-4 text-muted-foreground">{formatDate(row.phoneVerifiedAt)}</td>
                  <td className="px-5 py-4"><p className="max-w-md text-xs text-muted-foreground">{row.pausedReason}</p></td>
                </tr>
              ))}
              {!data.pausedProfiles.length ? <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">No payout profiles are paused.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

async function loadPayoutData() {
  const [payouts, pausedProfiles] = await Promise.all([
    prisma.creatorPayout.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { fullName: true, email: true, phoneNumber: true } } },
    }),
    prisma.payoutProfile.findMany({
      where: { pausedReason: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { user: { select: { fullName: true, email: true, phoneNumber: true } } },
    }),
  ])
  return { payouts, pausedProfiles }
}

function UserCell({ user }: { user: { fullName: string | null; email: string | null; phoneNumber: string | null } }) {
  return <div><p className="font-medium">{user.fullName || "Unnamed account"}</p><p className="text-xs text-muted-foreground">{user.email || user.phoneNumber || "—"}</p></div>
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p>{icon}</div><p className="mt-3 text-3xl font-bold tabular-nums">{value}</p></div>
}

function MigrationNotice({ label }: { label: string }) {
  return <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Staging migration required</p><p className="mt-1 text-amber-800">The {label} tables are not available in this database yet. Apply the monetization migration on staging before using this page.</p></div></div>
}

function mask(value: string | null) {
  if (!value) return "—"
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "—"
}
