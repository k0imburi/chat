import { revalidatePath } from "next/cache"
import { AlertTriangle, Gem, ReceiptText, RotateCcw, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { reviewHeldTipAction } from "@/lib/actions/monetization"
import { prisma } from "@/lib/prisma"

const tierLabel: Record<string, string> = {
  PEBBLE: "Pebble",
  GEM: "Gem",
  DIAMOND: "Diamond",
}

export default async function HeldTipsPage() {
  let migrationRequired = false
  let rows: Awaited<ReturnType<typeof loadHeldTips>> = []
  try {
    rows = await loadHeldTips()
  } catch {
    migrationRequired = true
  }

  const totalCreatorUsd = rows.reduce((sum, row) => sum + Number(row.creatorAmountUsd), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Held tip reviews"
        description="Release or refund creator shares for sixth-and-later tips within a 24-hour window."
      />

      {migrationRequired ? <MigrationNotice label="tip review" /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Held tips" value={rows.length.toLocaleString()} icon={<Gem className="h-5 w-5 text-emerald-700" />} />
        <SummaryCard label="Creator share held" value={`USD ${totalCreatorUsd.toFixed(2)}`} icon={<ReceiptText className="h-5 w-5 text-amber-700" />} />
        <SummaryCard label="Provider refund note" value="Manual" icon={<RotateCcw className="h-5 w-5 text-rose-700" />} />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          <ShieldCheck className="h-5 w-5" />
          <h2 className="font-semibold">Held queue</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-5 py-3">Created</th><th className="px-5 py-3">Sender</th><th className="px-5 py-3">Creator</th><th className="px-5 py-3">Tier</th><th className="px-5 py-3">Held share</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Decision</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{formatDate(row.createdAt)}</td>
                  <td className="px-5 py-4"><UserCell user={row.sender} /></td>
                  <td className="px-5 py-4"><UserCell user={row.receiver} /></td>
                  <td className="px-5 py-4">{tierLabel[row.tier] || row.tier}</td>
                  <td className="px-5 py-4 font-semibold tabular-nums">USD {Number(row.creatorAmountUsd).toFixed(2)}</td>
                  <td className="px-5 py-4 font-mono text-xs">{mask(row.transactionId)}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <form action={releaseTip}><input type="hidden" name="tipId" value={row.id} /><Button size="sm" type="submit">Release</Button></form>
                      <form action={refundTip}><input type="hidden" name="tipId" value={row.id} /><Button size="sm" variant="destructive" type="submit">Approve refund</Button></form>
                    </div>
                    <p className="mt-2 max-w-xs text-xs text-muted-foreground">Refund approval reverses the earning lot and flags provider refund follow-up.</p>
                  </td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No held tips need review.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

async function releaseTip(formData: FormData) {
  "use server"
  await reviewHeldTipAction({ tipId: String(formData.get("tipId") || ""), decision: "RELEASE" })
  revalidatePath("/held-tips")
}

async function refundTip(formData: FormData) {
  "use server"
  await reviewHeldTipAction({ tipId: String(formData.get("tipId") || ""), decision: "REFUND" })
  revalidatePath("/held-tips")
}

function loadHeldTips() {
  return prisma.tip.findMany({
    where: { reviewStatus: "HELD" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      sender: { select: { fullName: true, email: true, phoneNumber: true } },
      receiver: { select: { fullName: true, email: true, phoneNumber: true } },
    },
  })
}

function UserCell({ user }: { user: { fullName: string | null; email: string | null; phoneNumber: string | null } }) {
  return <div><p className="font-medium">{user.fullName || "Unnamed account"}</p><p className="text-xs text-muted-foreground">{user.email || user.phoneNumber || "—"}</p></div>
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p>{icon}</div><p className="mt-3 text-3xl font-bold tabular-nums">{value}</p></div>
}

function MigrationNotice({ label }: { label: string }) {
  return <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Staging migration required</p><p className="mt-1 text-amber-800">The {label} tables are not available in this database yet. Apply the monetization migration on staging before using this queue.</p></div></div>
}

function mask(value: string | null) {
  if (!value) return "—"
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`
}

function formatDate(value: Date) {
  return value.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })
}
