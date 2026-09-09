"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { TechnicalIssueStatus } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import {
  queryTechnicalIssuesAction,
  updateTechnicalIssueStatusAction,
} from "@/lib/actions/technical-issues"
import { formatDateTime } from "@/lib/format"

type Issue = Awaited<ReturnType<typeof queryTechnicalIssuesAction>>[number]

const statusLabel: Record<TechnicalIssueStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
}

export function TechnicalIssuesTable({ initialIssues }: { initialIssues: Issue[] }) {
  const [issues, setIssues] = useState(initialIssues)
  const [query, setQuery] = useState("")
  const [isPending, startTransition] = useTransition()

  function search() {
    startTransition(async () => setIssues(await queryTechnicalIssuesAction(query)))
  }

  function setStatus(issueId: string, status: TechnicalIssueStatus) {
    startTransition(async () => {
      await updateTechnicalIssueStatusAction(issueId, status)
      setIssues((current) => current.map((issue) =>
        issue.id === issueId ? { ...issue, status } : issue,
      ))
    })
  }

  const columns: DataTableColumn<Issue>[] = [
    {
      key: "user",
      header: "User",
      render: (issue) => (
        <div>
          <Link href={`/users/${issue.user.id}`} className="font-medium hover:text-primary">
            {issue.user.fullName}
          </Link>
          <p className="text-xs text-muted-foreground">
            {issue.user.username ? `@${issue.user.username}` : issue.user.email || "No email"}
          </p>
        </div>
      ),
    },
    {
      key: "problem",
      header: "Problem",
      cellClassName: "max-w-xl",
      render: (issue) => (
        <div className="space-y-1">
          <p className="font-medium">{issue.subject}</p>
          <p className="whitespace-pre-wrap text-sm leading-5 text-muted-foreground">{issue.description}</p>
        </div>
      ),
    },
    {
      key: "device",
      header: "App / device",
      render: (issue) => (
        <div className="text-xs text-muted-foreground">
          <p>{issue.appVersion || "Unknown version"}</p>
          <p>{issue.platform || "Unknown platform"}</p>
        </div>
      ),
    },
    {
      key: "date",
      header: "Submitted",
      render: (issue) => formatDateTime(issue.createdAt),
    },
    {
      key: "status",
      header: "Status",
      render: (issue) => <span className="text-sm font-medium">{statusLabel[issue.status]}</span>,
    },
    {
      key: "actions",
      header: "",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (issue) => (
        <div className="flex justify-end gap-2">
          {issue.status === TechnicalIssueStatus.OPEN && (
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus(issue.id, TechnicalIssueStatus.IN_PROGRESS)}>
              Start review
            </Button>
          )}
          {issue.status !== TechnicalIssueStatus.RESOLVED && (
            <Button size="sm" disabled={isPending} onClick={() => setStatus(issue.id, TechnicalIssueStatus.RESOLVED)}>
              Resolve
            </Button>
          )}
          {issue.status === TechnicalIssueStatus.RESOLVED && (
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => setStatus(issue.id, TechnicalIssueStatus.OPEN)}>
              Reopen
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <DataTable
      rows={issues}
      columns={columns}
      getRowKey={(issue) => issue.id}
      loading={isPending}
      emptyTitle="No technical problems"
      emptyDescription="New app problem reports will appear here."
      toolbar={(
        <div className="flex items-center gap-2.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && search()}
              placeholder="Search user, subject, or description..."
              className="h-9 pl-9"
            />
          </div>
          <Button type="button" size="sm" onClick={search} disabled={isPending}>Search</Button>
        </div>
      )}
    />
  )
}
