"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Download, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { deleteAssetAdminAction, getAssetDownloadUrlAction, queryAssetsAdminAction } from "@/lib/actions/ops"
import { formatDateTime } from "@/lib/format"
import { initialActionResult } from "@/lib/actions/action-result"

type AssetsData = Awaited<ReturnType<typeof queryAssetsAdminAction>>
type AssetRow = AssetsData["items"][number]

function formatSize(sizeBytes: number | null) {
  const bytes = Number(sizeBytes ?? 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function AssetsTable({ initialData }: { initialData: AssetsData }) {
  const [data, setData] = useState(initialData)
  const [query, setQuery] = useState("")
  const [isPending, startTransition] = useTransition()

  function refetch() {
    startTransition(async () => {
      const next = await queryAssetsAdminAction({ query })
      setData(next)
    })
  }

  function handleDownload(assetId: string) {
    startTransition(async () => {
      try {
        const result = await getAssetDownloadUrlAction(assetId)
        window.open(result.url, "_blank", "noopener,noreferrer")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to generate download link.")
      }
    })
  }

  function handleDelete(assetId: string) {
    startTransition(async () => {
      const formData = new FormData()
      formData.set("assetId", assetId)
      const result = await deleteAssetAdminAction(initialActionResult, formData)
      if (result.success) {
        toast.success(result.message)
        const next = await queryAssetsAdminAction({ query })
        setData(next)
        return
      }

      toast.error(result.message || "Unable to delete asset.")
    })
  }

  const columns: DataTableColumn<AssetRow>[] = [
    {
      key: "asset",
      header: "Asset",
      render: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">{row.objectKey}</p>
        </div>
      ),
    },
    {
      key: "usage",
      header: "Usage",
      render: (row) =>
        row.isLinked ? (
          <div>
            <Link href={`/users/${row.linkedUserId}`} className="font-medium hover:text-primary">
              {row.linkedUserName}
            </Link>
            <p className="text-xs text-muted-foreground">{row.linkedKind?.replace(/_/g, " ")}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">Orphaned</span>
        ),
    },
    {
      key: "type",
      header: "Content type",
      render: (row) => row.contentType || "—",
    },
    {
      key: "size",
      header: "Size",
      render: (row) => formatSize(row.sizeBytes),
    },
    {
      key: "date",
      header: "Uploaded",
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => handleDownload(row.id)}>
            <Download className="h-4 w-4" />
          </Button>
          {!row.isLinked ? (
            <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={() => handleDelete(row.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
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
              onKeyDown={(e) => e.key === "Enter" && refetch()}
              placeholder="Search by file name, key, bucket, or type..."
              className="h-9 pl-9"
            />
          </div>
          <Button type="button" size="sm" onClick={refetch} disabled={isPending}>
            Search
          </Button>
        </div>
      }
      loading={isPending}
      rows={data.items}
      columns={columns}
      getRowKey={(row) => row.id}
      emptyTitle="No assets found"
      emptyDescription="Uploaded R2 assets will appear here."
    />
  )
}
