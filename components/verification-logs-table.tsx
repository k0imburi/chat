"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { queryVerificationLogsAdminAction, revokeVerificationCodeAction } from "@/lib/actions/ops"
import { formatDateTime, formatRelative, toTitleCase } from "@/lib/format"

type VerificationData = Awaited<ReturnType<typeof queryVerificationLogsAdminAction>>
type VerificationRow = VerificationData["items"][number]

function StateBadge({ value }: { value: string }) {
  const classes: Record<string, string> = {
    active: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
    consumed: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-400",
    expired: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400",
  }

  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes[value] ?? ""}`}>{toTitleCase(value)}</span>
}

export function VerificationLogsTable({ initialData }: { initialData: VerificationData }) {
  const [data, setData] = useState(initialData)
  const [query, setQuery] = useState("")
  const [purpose, setPurpose] = useState("ALL")
  const [isPending, startTransition] = useTransition()

  function refetch() {
    startTransition(async () => {
      const next = await queryVerificationLogsAdminAction({ query, purpose })
      setData(next)
    })
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      try {
        const result = await revokeVerificationCodeAction(id)
        toast.success(result.message)
        const next = await queryVerificationLogsAdminAction({ query, purpose })
        setData(next)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to revoke verification code.")
      }
    })
  }

  const columns: DataTableColumn<VerificationRow>[] = [
    {
      key: "recipient",
      header: "Recipient",
      render: (row) => (
        <div>
          <p className="font-medium">{row.recipient}</p>
          {row.user ? (
            <Link href={`/users/${row.user.id}`} className="text-xs text-muted-foreground hover:text-primary">
              {row.user.fullName}
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">No linked user</p>
          )}
        </div>
      ),
    },
    {
      key: "purpose",
      header: "Purpose",
      render: (row) => (
        <div>
          <p className="font-medium">{toTitleCase(row.purpose)}</p>
          <p className="text-xs text-muted-foreground">{toTitleCase(row.channel)}</p>
        </div>
      ),
    },
    {
      key: "state",
      header: "State",
      render: (row) => <StateBadge value={row.state} />,
    },
    {
      key: "attempts",
      header: "Attempts",
      render: (row) => row.attempts.toLocaleString(),
    },
    {
      key: "expires",
      header: "Expiry",
      render: (row) => (
        <div>
          <p>{formatDateTime(row.expiresAt)}</p>
          <p className="text-xs text-muted-foreground">{formatRelative(row.expiresAt)}</p>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) =>
        row.state === "active" ? (
          <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={() => handleRevoke(row.id)}>
            Revoke
          </Button>
        ) : null,
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
              placeholder="Search by recipient, name, email, or phone..."
              className="h-9 pl-9"
            />
          </div>
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">All purposes</option>
            <option value="PHONE_LOGIN">Phone login</option>
            <option value="PASSWORD_RESET">Password reset</option>
          </select>
          <Button type="button" size="sm" onClick={refetch} disabled={isPending}>
            Search
          </Button>
        </div>
      }
      loading={isPending}
      rows={data.items}
      columns={columns}
      getRowKey={(row) => row.id}
      emptyTitle="No verification logs"
      emptyDescription="OTP and password reset verification attempts will appear here."
    />
  )
}
