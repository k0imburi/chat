import { AlertTriangle, CheckCircle2, Clock3, ReceiptText } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { prisma } from "@/lib/prisma"

const statusStyles: Record<string, string> = {
  SUCCEEDED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-rose-100 text-rose-800",
  CANCELLED: "bg-neutral-100 text-neutral-700",
  REQUIRES_REVIEW: "bg-amber-100 text-amber-900",
  VERIFYING: "bg-sky-100 text-sky-800",
  FULFILLING: "bg-violet-100 text-violet-800",
}

function mask(value: string | null) {
  if (!value) return "—"
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`
}

export default async function PaymentReconciliationPage() {
  let migrationRequired = false
  let attempts: Awaited<ReturnType<typeof loadAttempts>> = []
  try {
    attempts = await loadAttempts()
  } catch {
    migrationRequired = true
  }

  const succeeded = attempts.filter((item) => item.status === "SUCCEEDED").length
  const review = attempts.filter((item) => item.status === "REQUIRES_REVIEW").length
  const pending = attempts.filter((item) => ["CREATED", "SUBMITTING", "PENDING", "VERIFYING", "FULFILLING"].includes(item.status)).length

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Finance" title="Payment reconciliation" description="Inspect immutable M-PESA attempts, verification state, and fulfillment outcomes. Customer value is allocated only after provider verification." />

      {migrationRequired ? (
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-bold">Staging migration required</p><p className="mt-1 text-amber-800">The payment audit tables are not available in this database yet. Back up and apply the monetization migration on staging before enabling live collections.</p></div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Awaiting completion", value: pending, Icon: Clock3, color: "text-sky-700" },
          { label: "Requires review", value: review, Icon: AlertTriangle, color: "text-amber-700" },
          { label: "Succeeded", value: succeeded, Icon: CheckCircle2, color: "text-emerald-700" },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><Icon className={`h-5 w-5 ${color}`} /></div><p className="mt-3 text-3xl font-bold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">Latest 100 attempts</p></div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-5 py-4"><ReceiptText className="h-5 w-5" /><h2 className="font-semibold">Payment attempts</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Created</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Purpose</th><th className="px-5 py-3">Expected</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">Receipt</th><th className="px-5 py-3">Status</th></tr></thead>
            <tbody className="divide-y">
              {attempts.map((attempt) => <tr key={attempt.id} className="hover:bg-muted/30"><td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{attempt.createdAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</td><td className="px-5 py-4"><p className="font-medium">{attempt.user?.fullName || "Unknown"}</p><p className="text-xs text-muted-foreground">{attempt.user?.email || "No email"}</p></td><td className="px-5 py-4">{attempt.purpose.replaceAll("_", " ")}</td><td className="px-5 py-4 font-semibold tabular-nums">{attempt.currency} {Number(attempt.amount).toFixed(2)}</td><td className="px-5 py-4 font-mono text-xs">{mask(attempt.expectedPhone)}</td><td className="px-5 py-4 font-mono text-xs">{mask(attempt.providerReceipt)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[attempt.status] || "bg-neutral-100 text-neutral-700"}`}>{attempt.status.replaceAll("_", " ")}</span></td></tr>)}
              {!attempts.length ? <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No payment attempts are available.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function loadAttempts() {
  return prisma.paymentAttempt.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { fullName: true, email: true } } },
  })
}
