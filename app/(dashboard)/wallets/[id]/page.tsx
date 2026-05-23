import { notFound } from "next/navigation"
import { ArrowDownLeft, ArrowUpRight, CreditCard, Landmark, Wallet } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { FinanceStatusBadge } from "@/components/finance-status-badge"
import { PageHeader } from "@/components/page-header"
import { WalletAdjustmentModal } from "@/components/wallet-adjustment-modal"
import { getWalletDetail } from "@/lib/finance-queries"
import { formatCurrency, formatDateTime, formatRelative } from "@/lib/format"

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string
  value: string
  hint: string
  icon: typeof Wallet
}) {
  return (
    <Card className="rounded-lg border-border/60">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="rounded-lg bg-muted p-3 text-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getWalletDetail(id)
  return {
    title: detail ? `${detail.user.fullName} Wallet` : "Wallet",
  }
}

export default async function WalletDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getWalletDetail(id)

  if (!detail) {
    notFound()
  }

  const columns: DataTableColumn<(typeof detail.ledger)[number]>[] = [
    {
      key: "transactionId",
      header: "Reference",
      render: (row) => (
        <div>
          <p className="font-medium">{row.transactionId}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(row.date)}</p>
        </div>
      ),
    },
    {
      key: "direction",
      header: "Direction",
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.signedAmount >= 0 ? (
            <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
          ) : (
            <ArrowUpRight className="h-4 w-4 text-rose-500" />
          )}
          <FinanceStatusBadge value={row.type} />
        </div>
      ),
    },
    {
      key: "counterparty",
      header: "Counterparty",
      render: (row) => (
        <div>
          <p className="font-medium">
            {row.signedAmount >= 0 ? row.senderName : row.receiverName}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.signedAmount >= 0 ? "Source" : "Destination"}
          </p>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => (
        <span className={row.signedAmount >= 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-rose-600 dark:text-rose-400"}>
          {row.signedAmount >= 0 ? "+" : "-"}
          {formatCurrency(Math.abs(row.amount), "USD")}
        </span>
      ),
    },
    {
      key: "postBalance",
      header: "Post balance",
      render: (row) => <span className="font-medium">{formatCurrency(row.postBalance, "USD")}</span>,
    },
    {
      key: "metadata",
      header: "Notes",
      render: (row) => {
        const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {}
        return (
          <div className="text-sm text-muted-foreground">
            {typeof metadata.reason === "string" ? metadata.reason : typeof metadata.source === "string" ? metadata.source : "—"}
          </div>
        )
      },
    },
  ]

  const withdrawalColumns: DataTableColumn<(typeof detail.withdrawals)[number]>[] = [
    {
      key: "date",
      header: "Requested",
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "method",
      header: "Method",
      render: (row) => (
        <div>
          <p className="font-medium">{row.method}</p>
          <p className="text-xs text-muted-foreground">{row.destination}</p>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (row) => formatCurrency(row.amount, "USD"),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <FinanceStatusBadge value={row.status} />,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Wallet account"
        title={detail.user.fullName}
        description={`${detail.accountId} • ${detail.user.email || detail.user.phoneNumber || "No primary contact"}`}
        actions={<WalletAdjustmentModal userId={detail.user.id} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Current balance"
          value={formatCurrency(detail.summary.currentBalance, "USD")}
          hint={`Wallet opened ${formatRelative(detail.user.createdAt)}`}
          icon={Wallet}
        />
        <MetricCard
          title="Credits"
          value={formatCurrency(detail.summary.totalCredits, "USD")}
          hint="All incoming entries posted to this account"
          icon={ArrowDownLeft}
        />
        <MetricCard
          title="Debits"
          value={formatCurrency(detail.summary.totalDebits, "USD")}
          hint="All outgoing entries posted to this account"
          icon={ArrowUpRight}
        />
        <MetricCard
          title="Pending withdrawals"
          value={formatCurrency(detail.summary.pendingWithdrawalAmount, "USD")}
          hint={`${detail.summary.pendingWithdrawalCount} request(s) awaiting settlement`}
          icon={Landmark}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <DataTable
          title="Ledger history"
          description="Every posted credit and debit with running post-balance."
          rows={detail.ledger}
          columns={columns}
          getRowKey={(row) => row.id}
          emptyTitle="No wallet activity"
          emptyDescription="No transactions have been posted to this account yet."
        />

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Account profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Account ID</p>
              <p className="mt-2 font-medium">{detail.accountId}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Location</p>
              <p className="mt-2 font-medium">
                {[detail.user.city, detail.user.country].filter(Boolean).join(", ") || "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Account status</p>
              <div className="mt-2">
                <FinanceStatusBadge value={detail.user.status.toLowerCase()} />
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Ledger entries</p>
              <p className="mt-2 font-medium">{detail.summary.transactionCount.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        title="Withdrawal history"
        description="Requests raised from the mobile wallet for this account."
        rows={detail.withdrawals}
        columns={withdrawalColumns}
        getRowKey={(row) => row.id}
        emptyTitle="No withdrawals"
        emptyDescription="No withdrawal requests have been logged for this wallet."
      />
    </div>
  )
}
