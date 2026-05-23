import { CircleDollarSign, Landmark, Scale, Wallet } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { WalletsTable } from "@/components/wallets-table"
import { getWalletAccounts } from "@/lib/finance-queries"
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

export default async function WalletsPage() {
  const data = await getWalletAccounts({})

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="User wallets"
        description="Track wallet balances, account health, and ledger activity across the mobile platform."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Wallet accounts"
          value={data.summary.totalWallets.toLocaleString()}
          hint={`${data.summary.activeWallets} active ledgers with transaction history`}
          icon={Wallet}
          gradient="from-emerald-600 to-teal-600"
        />
        <SummaryCard
          title="Combined balance"
          value={formatCurrency(data.summary.totalBalance, "USD")}
          hint={`${data.summary.totalTransactions.toLocaleString()} ledger entries recorded`}
          icon={Scale}
          gradient="from-sky-600 to-cyan-600"
        />
        <SummaryCard
          title="Pending withdrawals"
          value={data.summary.pendingWithdrawalCount.toLocaleString()}
          hint={`${formatCurrency(data.summary.pendingWithdrawalAmount, "USD")} awaiting action`}
          icon={Landmark}
          gradient="from-amber-500 to-orange-500"
        />
        <SummaryCard
          title="Transaction volume"
          value={data.summary.totalTransactions.toLocaleString()}
          hint="Credits and debits reflected live from the mobile ledger"
          icon={CircleDollarSign}
          gradient="from-violet-600 to-indigo-600"
        />
      </div>

      <WalletsTable initialData={data} />
    </div>
  )
}
