"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { BadgeCheck, ChevronLeft, ChevronRight, Eye, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { StatusBadge } from "@/components/status-badge"
import {
  queryUsersAction,
  setUserVerifiedAction,
  updateUserStatusByIdAction,
  deleteUserByIdAction,
} from "@/lib/actions/users"
import { STATUS_OPTIONS, USER_FILTER_OPTIONS } from "@/lib/constants"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"

type UsersData = Awaited<ReturnType<typeof queryUsersAction>>
type User = UsersData["items"][number]

export function UsersTable({ initialData }: { initialData: UsersData }) {
  const [data, setData] = useState(initialData)
  const [query, setQuery] = useState("")
  const [filterBy, setFilterBy] = useState("fullName")
  const [status, setStatus] = useState("ALL")
  const [isPending, startTransition] = useTransition()

  function refetch(overrides: { page?: number } = {}) {
    const params = { query, filterBy, status, page: data.page, ...overrides }
    startTransition(async () => {
      const result = await queryUsersAction(params)
      setData(result)
    })
  }

  function handleApply() {
    refetch({ page: 1 })
  }

  function handlePageChange(page: number) {
    refetch({ page })
  }

  function handleToggleVerify(userId: string, verified: boolean) {
    startTransition(async () => {
      await setUserVerifiedAction(userId, verified)
      const result = await queryUsersAction({ query, filterBy, status, page: data.page })
      setData(result)
    })
  }

  function handleToggleBlock(userId: string, currentStatus: string) {
    const newStatus = currentStatus === "BLOCKED" ? "ACTIVE" : "BLOCKED"
    startTransition(async () => {
      await updateUserStatusByIdAction(userId, newStatus)
      const result = await queryUsersAction({ query, filterBy, status, page: data.page })
      setData(result)
    })
  }

  function handleDelete(userId: string) {
    if (!window.confirm("Delete this user permanently? This cannot be undone.")) return
    startTransition(async () => {
      await deleteUserByIdAction(userId)
      const result = await queryUsersAction({ query, filterBy, status, page: data.page })
      setData(result)
    })
  }

  const columns: DataTableColumn<User>[] = [
    {
      key: "name",
      header: "Name",
      render: (user) => (
        <div className="flex items-center gap-1.5">
          <Link href={`/users/${user.id}`} className="font-medium hover:text-primary">
            {user.fullName}
          </Link>
          {user.verified && (
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
          )}
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      cellClassName: "text-muted-foreground",
      render: (user) => (
        <>
          <div>{user.email || "—"}</div>
          <div>{user.phoneNumber || "—"}</div>
        </>
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (user) => [user.city, user.country].filter(Boolean).join(", ") || "—",
    },
    {
      key: "status",
      header: "Status",
      render: (user) => <StatusBadge value={user.status} />,
    },
    {
      key: "last-active",
      header: "Last active",
      render: (user) => formatRelative(user.lastActiveAt ?? user.createdAt),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-px",
      cellClassName: "w-px",
      render: (user) => {
        const isBlocked = user.status === "BLOCKED"
        return (
          <div className="flex items-center gap-1">

            {/* Edit — navigates to user detail */}
            <Link
              href={`/users/${user.id}`}
              title="View user"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            >
              <Eye className="h-3.5 w-3.5" />
            </Link>
            {/* Block / Unblock toggle switch */}
            <button
              type="button"
              title={isBlocked ? "Unblock user" : "Block user"}
              disabled={isPending}
              onClick={() => handleToggleBlock(user.id, user.status)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50",
                isBlocked ? "bg-rose-500" : "bg-emerald-500",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
                  isBlocked ? "translate-x-0" : "translate-x-4",
                )}
              />
            </button>

            {/* Verify / Unverify toggle */}
            <button
              type="button"
              title={user.verified ? "Remove verification" : "Verify user"}
              disabled={isPending}
              onClick={() => handleToggleVerify(user.id, !user.verified)}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50",
                user.verified
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <BadgeCheck className="h-4 w-4" />
            </button>

            {/* Delete */}
            <button
              type="button"
              title="Delete user"
              disabled={isPending}
              onClick={() => handleDelete(user.id)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      },
    },
  ]

  const { page, pageSize, total, totalPages, items } = data

  const toolbar = (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleApply()}
          placeholder="Search users..."
          className="h-9 pl-9"
        />
      </div>
      <select
        value={filterBy}
        onChange={(e) => setFilterBy(e.target.value)}
        className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
      >
        {USER_FILTER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Button type="button" size="sm" onClick={handleApply} disabled={isPending}>
        Apply
      </Button>
    </div>
  )

  return (
    <DataTable
      toolbar={toolbar}
      loading={isPending}
      rows={items}
      columns={columns}
      getRowKey={(user) => user.id}
      showRowNumbers
      rowNumberOffset={(page - 1) * pageSize}
      footerStart={
        total > 0 ? (
          <span>
            Showing{" "}
            <strong className="font-semibold text-foreground">
              {(page - 1) * pageSize + 1}
            </strong>
            {" – "}
            <strong className="font-semibold text-foreground">
              {Math.min(page * pageSize, total)}
            </strong>
            {" of "}
            <strong className="font-semibold text-foreground">{total}</strong>
          </span>
        ) : null
      }
      footerEnd={
        <PaginationBar page={page} totalPages={totalPages} onPageChange={handlePageChange} />
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
  const maxVisible = 5
  let start = Math.max(1, page - Math.floor(maxVisible / 2))
  let end = start + maxVisible - 1
  if (end > totalPages) {
    end = totalPages
    start = Math.max(1, end - maxVisible + 1)
  }
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)
  const isFirst = page <= 1
  const isLast = page >= totalPages
  const nav = "flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium transition-colors"

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
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
            p === page ? "border-transparent bg-primary text-primary-foreground" : "border-border hover:bg-muted/40",
          )}
        >
          {p}
        </button>
      ))}
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
