"use client"

import Image from "next/image"
import Link from "next/link"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Toggle } from "@/components/ui/toggle"
import type { RankedPost } from "@/lib/explore-insights"

type TypeFilter = "all" | "video" | "image"
type SortKey = "score" | "views" | "likes" | "comments" | "age"

const PAGE_SIZE = 25

function formatAge(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

export function ExploreInsightsTable({ posts }: { posts: RankedPost[] }) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [hideZero, setHideZero] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("score")
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    let rows = posts
    if (typeFilter !== "all") rows = rows.filter((p) => p.kind === typeFilter)
    if (hideZero) rows = rows.filter((p) => p.engagement > 0)
    const sorted = [...rows].sort((a, b) => {
      switch (sortKey) {
        case "views":
          return b.views - a.views
        case "likes":
          return b.likes - a.likes
        case "comments":
          return b.comments - a.comments
        case "age":
          return a.ageHours - b.ageHours // freshest first
        default:
          return b.score - a.score
      }
    })
    return sorted
  }, [posts, typeFilter, hideZero, sortKey])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const start = safePage * PAGE_SIZE
  const rows = filtered.slice(start, start + PAGE_SIZE)

  // Reset to first page whenever a filter/sort changes the result set.
  const resetPage = () => setPage(0)

  const columns: DataTableColumn<RankedPost>[] = [
    {
      key: "thumb",
      header: "",
      headerClassName: "w-14",
      render: (p) =>
        p.thumbnailUrl ? (
          <div className="relative h-12 w-9 overflow-hidden rounded-md bg-muted">
            <Image
              src={p.thumbnailUrl}
              alt=""
              fill
              sizes="36px"
              className="object-cover"
              unoptimized
            />
          </div>
        ) : (
          <div className="h-12 w-9 rounded-md bg-muted" />
        ),
    },
    {
      key: "owner",
      header: "Owner",
      render: (p) => (
        <Link
          href={`/users/${p.ownerId}`}
          className="font-medium text-primary hover:underline"
        >
          {p.owner}
        </Link>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (p) => (
        <Badge variant={p.kind === "image" ? "secondary" : "outline"}>{p.kind}</Badge>
      ),
    },
    {
      key: "age",
      header: "Age",
      cellClassName: "text-right tabular-nums text-muted-foreground",
      headerClassName: "text-right",
      render: (p) => formatAge(p.ageHours),
    },
    {
      key: "likes",
      header: "Likes",
      cellClassName: "text-right tabular-nums",
      headerClassName: "text-right",
      render: (p) => p.likes,
    },
    {
      key: "comments",
      header: "Cmts",
      cellClassName: "text-right tabular-nums",
      headerClassName: "text-right",
      render: (p) => p.comments,
    },
    {
      key: "views",
      header: "Views",
      cellClassName: "text-right tabular-nums",
      headerClassName: "text-right",
      render: (p) => p.views,
    },
    {
      key: "engagement",
      header: "Engagement",
      cellClassName: "text-right tabular-nums",
      headerClassName: "text-right",
      render: (p) => p.engagement.toFixed(1),
    },
    {
      key: "recency",
      header: "Recency ×",
      cellClassName: "text-right tabular-nums text-muted-foreground",
      headerClassName: "text-right",
      render: (p) => p.recencyFactor.toFixed(4),
    },
    {
      key: "score",
      header: "Score",
      cellClassName: "text-right font-semibold tabular-nums",
      headerClassName: "text-right",
      render: (p) => p.score.toFixed(4),
    },
  ]

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={typeFilter}
        onValueChange={(v) => {
          setTypeFilter(v as TypeFilter)
          resetPage()
        }}
      >
        <SelectTrigger className="h-9 w-[140px]">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="video">Videos</SelectItem>
          <SelectItem value="image">Images</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={sortKey}
        onValueChange={(v) => {
          setSortKey(v as SortKey)
          resetPage()
        }}
      >
        <SelectTrigger className="h-9 w-[150px]">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="score">Sort: Score</SelectItem>
          <SelectItem value="views">Sort: Views</SelectItem>
          <SelectItem value="likes">Sort: Likes</SelectItem>
          <SelectItem value="comments">Sort: Comments</SelectItem>
          <SelectItem value="age">Sort: Freshest</SelectItem>
        </SelectContent>
      </Select>

      <Toggle
        pressed={hideZero}
        onPressedChange={(v) => {
          setHideZero(v)
          resetPage()
        }}
        variant="outline"
        size="sm"
        className="h-9"
      >
        Hide zero-engagement
      </Toggle>

      <span className="ml-auto text-xs text-muted-foreground">
        {filtered.length.toLocaleString()} posts
      </span>
    </div>
  )

  const footer = (
    <div className="flex w-full items-center justify-between">
      <span className="text-xs text-muted-foreground">
        Page {safePage + 1} of {pageCount} · showing {rows.length} of {filtered.length}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={safePage === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      toolbar={toolbar}
      footerEnd={footer}
      showRowNumbers
      rowNumberOffset={start}
      getRowKey={(row) => row.id}
      emptyTitle="No posts match"
      emptyDescription="Try clearing the filters."
    />
  )
}
