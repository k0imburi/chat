"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { queryWalletAccountsAction } from "@/lib/actions/finance"
import { formatCurrency, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"

type WalletsData = Awaited<ReturnType<typeof queryWalletAccountsAction>>
type WalletAccount = WalletsData["items"][number]

export function WalletsTable({ initialData }: { initialData: WalletsData }) {
  const [data, setData] = useState(initialData)
  const [query, setQuery] = useState("")
  const [isPending, startTransition] = useTransition()

  function refetch(page = data.page) {
    startTransition(async () => {
      const result = await queryWalletAccountsAction({ query, page })
      setData(result)
    })
  }

  const columns: DataTableColumn<WalletAccount>[] = [
    {
      key: "account",
      header: "Account",
      render: (wallet) => (
        <div>
          <Link href={`/wallets/${wallet.id}`} className="font-medium hover:text-primary">
            {wallet.accountId}
          </Link>
          <p className="text-xs text-muted-foreground">{wallet.user.fullName}</p>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (wallet) => (
        <div className="text-muted-foreground">
          <div>{wallet.user.email || "—"}</div>
          <div>{wallet.user.phoneNumber || "—"}</div>
        </div>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      render: (wallet) => (
        <div>
          <p className="font-medium">{formatCurrency(wallet.currentBalance, "USD")}</p>
          <p className="text-xs text-muted-foreground">
            {wallet.transactionCount} {wallet.transactionCount === 1 ? "entry" : "entries"}
          </p>
        </div>
      ),
    },
    {
      key: "flow",
      header: "Flow",
      render: (wallet) => (
        <div className="space-y-1 text-sm">
          <p className="text-emerald-600 dark:text-emerald-400">In: {formatCurrency(wallet.totalCredits, "USD")}</p>
          <p className="text-rose-600 dark:text-rose-400">Out: {formatCurrency(wallet.totalDebits, "USD")}</p>
        </div>
      ),
    },
    {
      key: "withdrawals",
      header: "Pending withdrawals",
      render: (wallet) => (
        <div>
          <p className="font-medium">{wallet.pendingWithdrawalCount}</p>
          <p className="text-xs text-muted-foreground">{formatCurrency(wallet.pendingWithdrawalAmount, "USD")}</p>
        </div>
      ),
    },
    {
      key: "last",
      header: "Last activity",
      render: (wallet) =>
        wallet.lastTransactionAt ? (
          formatRelative(wallet.lastTransactionAt)
        ) : (
          <span className="text-muted-foreground">No transactions yet</span>
        ),
    },
  ]

  return (
    <DataTable
      toolbar={
        <div className="flex items-center gap-2.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && refetch(1)}
              placeholder="Search by account, name, email, or phone..."
              className="h-9 pl-9"
            />
          </div>
          <Button type="button" size="sm" onClick={() => refetch(1)} disabled={isPending}>
            Search
          </Button>
        </div>
      }
      loading={isPending}
      rows={data.items}
      columns={columns}
      getRowKey={(row) => row.id}
      emptyTitle="No wallets found"
      emptyDescription="Wallet accounts will appear here as mobile users transact."
      footerStart={
        data.total > 0 ? (
          <span>
            Showing{" "}
            <strong className="font-semibold text-foreground">
              {(data.page - 1) * data.pageSize + 1}
            </strong>
            {" – "}
            <strong className="font-semibold text-foreground">
              {Math.min(data.page * data.pageSize, data.total)}
            </strong>
            {" of "}
            <strong className="font-semibold text-foreground">{data.total}</strong>
          </span>
        ) : null
      }
      footerEnd={
        <PaginationBar
          page={data.page}
          totalPages={data.totalPages}
          onPageChange={refetch}
        />
      }
    />
  )
}

function PaginationBar({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  const nav = "flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium transition-colors"
  const isFirst = page <= 1
  const isLast = page >= totalPages

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={isFirst}
        onClick={() => onPageChange(page - 1)}
        className={cn(nav, isFirst ? "cursor-not-allowed opacity-50 text-muted-foreground" : "hover:bg-muted/40")}
      >
        <ChevronLeft className="h-4 w-4" />
        Prev
      </button>
      <button
        type="button"
        disabled={isLast}
        onClick={() => onPageChange(page + 1)}
        className={cn(nav, isLast ? "cursor-not-allowed opacity-50 text-muted-foreground" : "hover:bg-muted/40")}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
