"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { queryReportsAction, deleteReportByIdAction, resolveReportedMediaAction } from "@/lib/actions/reports"
import { formatDateTime } from "@/lib/format"

type Report = Awaited<ReturnType<typeof queryReportsAction>>[number]

export function ReportsTable({ initialReports }: { initialReports: Report[] }) {
  const [reports, setReports] = useState(initialReports)
  const [query, setQuery] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSearch() {
    startTransition(async () => {
      const result = await queryReportsAction(query)
      setReports(result)
    })
  }

  function handleDelete(reportId: string) {
    startTransition(async () => {
      await deleteReportByIdAction(reportId)
      setReports((prev) => prev.filter((r) => r.id !== reportId))
    })
  }

  function handleResolve(report: Report, decision: "restore" | "remove") {
    if (!report.media) return
    const mediaId = report.media.id
    startTransition(async () => {
      await resolveReportedMediaAction(mediaId, decision)
      setReports((prev) =>
        prev.map((r) =>
          r.media?.id === mediaId
            ? { ...r, media: { ...r.media, reportStatus: decision === "restore" ? null : "REMOVED" } }
            : r,
        ),
      )
    })
  }

  const columns: DataTableColumn<Report>[] = [
    {
      key: "content",
      header: "Reported content",
      render: (report) =>
        report.media ? (
          <a
            href={report.media.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 hover:opacity-80"
            title="Open post"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={report.media.thumbnailUrl || report.media.url}
              alt=""
              className="h-14 w-14 shrink-0 rounded-md border object-cover"
            />
            <span className="max-w-[160px] truncate text-xs text-muted-foreground">
              {report.media.title || "Untitled post"}
            </span>
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">Account report — no post</span>
        ),
    },
    {
      key: "reported-user",
      header: "Reported user",
      render: (report) => (
        <Link href={`/users/${report.target.id}`} className="font-medium hover:text-primary">
          {report.target.fullName}
        </Link>
      ),
    },
    {
      key: "reported-by",
      header: "Reported by",
      render: (report) => report.reporter?.fullName || report.reportedById || "Unknown",
    },
    {
      key: "message",
      header: "Message",
      cellClassName: "max-w-xl text-muted-foreground",
      render: (report) => report.message,
    },
    {
      key: "created",
      header: "Date",
      render: (report) => formatDateTime(report.createdAt),
    },
    {
      key: "action",
      header: "",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (report) => (
        <div className="flex justify-end gap-2">
          {report.media ? (
            report.media.reportStatus === "UNDER_REVIEW" ? (
              <>
                <Button type="button" size="sm" disabled={isPending} onClick={() => handleResolve(report, "restore")}>
                  Restore
                </Button>
                <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => handleResolve(report, "remove")}>
                  Remove
                </Button>
              </>
            ) : (
              <span className="self-center text-xs text-muted-foreground">
                {report.media.reportStatus === "REMOVED" ? "Removed" : "Restored"}
              </span>
            )
          ) : null}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => handleDelete(report.id)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ]

  const toolbar = (
    <div className="flex items-center gap-2.5">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search by user, reporter, or message..."
          className="h-9 pl-9"
        />
      </div>
      <Button type="button" size="sm" onClick={handleSearch} disabled={isPending}>
        Search
      </Button>
    </div>
  )

  return (
    <DataTable
      toolbar={toolbar}
      loading={isPending}
      rows={reports}
      columns={columns}
      getRowKey={(report) => report.id}
      emptyTitle="No reports"
      emptyDescription="No moderation reports have been filed yet."
    />
  )
}
