"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { FinanceStatusBadge } from "@/components/finance-status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { queryWithdrawalsAdminAction, updateWithdrawalStatusAdminAction } from "@/lib/actions/finance"
import { formatCurrency, formatDateTime } from "@/lib/format"

type WithdrawalsData = Awaited<ReturnType<typeof queryWithdrawalsAdminAction>>
type WithdrawalRow = WithdrawalsData["items"][number]

export function WithdrawalsTable({ initialData }: { initialData: WithdrawalsData }) {
  const [data, setData] = useState(initialData)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("ALL")
  const [isPending, startTransition] = useTransition()

  function refetch() {
    startTransition(async () => {
      const result = await queryWithdrawalsAdminAction({ query, status })
      setData(result)
    })
  }

  function handleStatusChange(withdrawalId: string, nextStatus: string) {
    startTransition(async () => {
      try {
        const result = await updateWithdrawalStatusAdminAction(withdrawalId, nextStatus)
        toast.success(result.message)
        const next = await queryWithdrawalsAdminAction({ query, status })
        setData(next)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to update withdrawal.")
      }
    })
  }

  const columns: DataTableColumn<WithdrawalRow>[] = [
    {
      key: "account",
      header: "Wallet",
      render: (row) => (
        <div>
          <Link href={`/wallets/${row.user.id}`} className="font-medium hover:text-primary">
            {row.user.fullName}
          </Link>
          <p className="text-xs text-muted-foreground">{row.user.email || row.user.phoneNumber || "—"}</p>
        </div>
      ),
    },
    {
      key: "destination",
      header: "Destination",
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
      render: (row) => <span className="font-medium">{formatCurrency(row.amount, "USD")}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <FinanceStatusBadge value={row.status} />,
    },
    {
      key: "requested",
      header: "Requested",
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {row.status === "pending" ? (
            <>
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => handleStatusChange(row.id, "approved")}>
                Approve
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={() => handleStatusChange(row.id, "rejected")}>
                Reject
              </Button>
            </>
          ) : null}
          {row.status === "approved" ? (
            <>
              <Button type="button" size="sm" disabled={isPending} onClick={() => handleStatusChange(row.id, "paid")}>
                Mark paid
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={() => handleStatusChange(row.id, "rejected")}>
                Reject
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <DataTable
      toolbar={
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && refetch()}
              placeholder="Search by user, destination, or method..."
              className="h-9 pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Button type="button" size="sm" onClick={refetch} disabled={isPending}>
            Apply
          </Button>
        </div>
      }
      loading={isPending}
      rows={data.items}
      columns={columns}
      getRowKey={(row) => row.id}
      emptyTitle="No withdrawals found"
      emptyDescription="Withdrawal requests will appear here as users cash out."
    />
  )
}
