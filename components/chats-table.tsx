"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { queryChatThreadsAdminAction } from "@/lib/actions/ops"
import { formatRelative, toTitleCase } from "@/lib/format"

type ChatsData = Awaited<ReturnType<typeof queryChatThreadsAdminAction>>
type ChatRow = ChatsData["items"][number]

export function ChatsTable({ initialData }: { initialData: ChatsData }) {
  const [data, setData] = useState(initialData)
  const [query, setQuery] = useState("")
  const [isPending, startTransition] = useTransition()

  function refetch() {
    startTransition(async () => {
      const next = await queryChatThreadsAdminAction({ query })
      setData(next)
    })
  }

  const columns: DataTableColumn<ChatRow>[] = [
    {
      key: "participants",
      header: "Participants",
      render: (row) => (
        <div>
          <Link href={`/chats/${row.id}`} className="font-medium hover:text-primary">
            {row.participants.map((participant) => participant.fullName).join(" • ")}
          </Link>
          <p className="text-xs text-muted-foreground">
            {row.participants.map((participant) => participant.email || participant.phoneNumber || participant.id).join(" • ")}
          </p>
        </div>
      ),
    },
    {
      key: "lastMessage",
      header: "Last message",
      cellClassName: "max-w-md",
      render: (row) => (
        <div>
          <p className="line-clamp-1 text-sm">{row.lastMessageText || "Media message"}</p>
          <p className="text-xs text-muted-foreground">{toTitleCase(row.lastMessageType)}</p>
        </div>
      ),
    },
    {
      key: "messages",
      header: "Messages",
      render: (row) => row.messageCount.toLocaleString(),
    },
    {
      key: "unread",
      header: "Unread",
      render: (row) => row.unreadCount.toLocaleString(),
    },
    {
      key: "archived",
      header: "Archived",
      render: (row) => row.archivedCount.toLocaleString(),
    },
    {
      key: "updated",
      header: "Last activity",
      render: (row) => formatRelative(row.lastMessageAt),
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
              placeholder="Search by participant name, email, or phone..."
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
      emptyTitle="No chat threads"
      emptyDescription="Threads will appear here as users exchange messages."
    />
  )
}
