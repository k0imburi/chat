"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { FinanceStatusBadge } from "@/components/finance-status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { queryTipRequestsAdminAction, updateTipRequestStatusAdminAction } from "@/lib/actions/finance"
import { formatCurrency, formatDateTime } from "@/lib/format"

type TipRequestsData = Awaited<ReturnType<typeof queryTipRequestsAdminAction>>
type TipRequestRow = TipRequestsData["items"][number]

export function TipRequestsTable({ initialData }: { initialData: TipRequestsData }) {
  const [data, setData] = useState(initialData)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("ALL")
  const [isPending, startTransition] = useTransition()

  function refetch() {
    startTransition(async () => {
      const result = await queryTipRequestsAdminAction({ query, status })
      setData(result)
    })
  }

  function handleStatusChange(tipRequestId: string, nextStatus: string) {
    startTransition(async () => {
      try {
        const result = await updateTipRequestStatusAdminAction(tipRequestId, nextStatus)
        toast.success(result.message)
        const next = await queryTipRequestsAdminAction({ query, status })
        setData(next)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to update tip request.")
      }
    })
  }

  const columns: DataTableColumn<TipRequestRow>[] = [
    {
      key: "sender",
      header: "Requested by",
      render: (row) => (
        <div>
          <Link href={`/users/${row.sender.id}`} className="font-medium hover:text-primary">
            {row.sender.fullName}
          </Link>
          <p className="text-xs text-muted-foreground">{row.sender.email || "—"}</p>
        </div>
      ),
    },
    {
      key: "receiver",
      header: "Recipient",
      render: (row) => (
        <div>
          <Link href={`/users/${row.receiver.id}`} className="font-medium hover:text-primary">
            {row.receiver.fullName}
          </Link>
          <p className="text-xs text-muted-foreground">{row.receiver.email || "—"}</p>
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
      key: "created",
      header: "Logged",
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-2">
          {row.status.toLowerCase() === "pending" ? (
            <>
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => handleStatusChange(row.id, "sent")}>
                Mark sent
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={() => handleStatusChange(row.id, "cancelled")}>
                Cancel
              </Button>
            </>
          ) : null}
          {row.status.toLowerCase() === "sent" ? (
            <>
              <Button type="button" size="sm" disabled={isPending} onClick={() => handleStatusChange(row.id, "completed")}>
                Complete
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={() => handleStatusChange(row.id, "cancelled")}>
                Cancel
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
              placeholder="Search by sender or recipient..."
              className="h-9 pl-9"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="SENT">Sent</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
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
      emptyTitle="No tip requests found"
      emptyDescription="Tip requests from the mobile app will appear here."
    />
  )
}
