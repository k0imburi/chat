import { Clock3, HandCoins, ReceiptText, XCircle } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TipRequestsTable } from "@/components/tip-requests-table"
import { getTipRequestsAdmin } from "@/lib/finance-queries"
import { formatCurrency } from "@/lib/format"

function SummaryCard({
  title,
  value,
  hint,
  icon: Icon,
  gradient,
}: {
  title: string
  value: string
  hint: string
  icon: typeof ReceiptText
  gradient: string
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${gradient} p-5 text-white`}>
      <div className="pointer-events-none absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-5 right-1 h-20 w-20 rounded-full bg-white/5" />
      <div className="relative flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-white/75">{title}</p>
        <Icon className="h-4 w-4 text-white/60" />
      </div>
      <p className="relative mt-3 text-4xl font-bold tabular-nums">{value}</p>
      <p className="relative mt-2 text-[11px] text-white/60">{hint}</p>
    </div>
  )
}

export default async function TipRequestsPage() {
  const data = await getTipRequestsAdmin({})

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monetization"
        title="Tip request logs"
        description="Audit who requested a tip, who received it, and how each tip request progressed through the mobile flow."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Pending requests"
          value={data.summary.pendingCount.toLocaleString()}
          hint={`${formatCurrency(data.summary.pendingAmount, "USD")} still awaiting movement`}
          icon={Clock3}
          gradient="from-amber-500 to-orange-500"
        />
        <SummaryCard
          title="Sent"
          value={data.summary.sentCount.toLocaleString()}
          hint="Requests acknowledged but not yet completed"
          icon={ReceiptText}
          gradient="from-sky-600 to-cyan-600"
        />
        <SummaryCard
          title="Completed"
          value={data.summary.completedCount.toLocaleString()}
          hint="Completed tip request flow records"
          icon={HandCoins}
          gradient="from-emerald-600 to-teal-600"
        />
        <SummaryCard
          title="Cancelled"
          value={data.summary.cancelledCount.toLocaleString()}
          hint="Requests closed without completion"
          icon={XCircle}
          gradient="from-rose-600 to-pink-600"
        />
      </div>

      <TipRequestsTable initialData={data} />
    </div>
  )
}
