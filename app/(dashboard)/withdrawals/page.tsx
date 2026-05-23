import { Landmark, ShieldCheck, Wallet, XCircle } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { WithdrawalsTable } from "@/components/withdrawals-table"
import { getWithdrawalsAdmin } from "@/lib/finance-queries"
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
  icon: typeof Wallet
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

export default async function WithdrawalsPage() {
  const data = await getWithdrawalsAdmin({})

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Withdrawal requests"
        description="Approve, reject, and settle cash-out requests while keeping the mobile wallet ledger accurate."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Pending"
          value={data.summary.pendingCount.toLocaleString()}
          hint={`${formatCurrency(data.summary.pendingAmount, "USD")} awaiting review`}
          icon={Landmark}
          gradient="from-amber-500 to-orange-500"
        />
        <SummaryCard
          title="Approved"
          value={formatCurrency(data.summary.approvedAmount, "USD")}
          hint="Approved, not yet marked paid"
          icon={ShieldCheck}
          gradient="from-sky-600 to-cyan-600"
        />
        <SummaryCard
          title="Settled"
          value={formatCurrency(data.summary.paidAmount, "USD")}
          hint="Requests already paid out"
          icon={Wallet}
          gradient="from-emerald-600 to-teal-600"
        />
        <SummaryCard
          title="Rejected / cancelled"
          value={formatCurrency(data.summary.rejectedAmount, "USD")}
          hint="Automatically reversed back into wallet balance"
          icon={XCircle}
          gradient="from-rose-600 to-pink-600"
        />
      </div>

      <WithdrawalsTable initialData={data} />
    </div>
  )
}
