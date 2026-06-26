import { notFound } from "next/navigation"
import Image from "next/image"
import { Camera, MessageSquareMore, PackageOpen, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { getChatThreadDetail } from "@/lib/ops-queries"
import { formatDateTime, formatRelative } from "@/lib/format"

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string
  value: string
  hint: string
  icon: typeof Users
}) {
  return (
    <Card className="rounded-lg border-border/60">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="rounded-lg bg-muted p-3 text-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

export default async function ChatThreadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getChatThreadDetail(id)

  if (!detail) return notFound()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Chat oversight"
        title={detail.participants.map((participant) => participant.fullName).join(" • ")}
        description={`Thread ${detail.id}`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Participants" value={detail.participants.length.toLocaleString()} hint="Mobile users in this thread" icon={Users} />
        <MetricCard title="Messages" value={detail.summary.messageCount.toLocaleString()} hint="Transcript entries" icon={MessageSquareMore} />
        <MetricCard title="Media" value={detail.summary.imageCount.toLocaleString()} hint="Image messages sent" icon={Camera} />
        <MetricCard title="Archived states" value={detail.summary.archivedCount.toLocaleString()} hint={`${detail.summary.unreadCount.toLocaleString()} unread across participants`} icon={PackageOpen} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Participants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.participants.map((participant) => (
              <div key={participant.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="relative h-12 w-12 overflow-hidden rounded-full bg-muted">
                  {participant.avatarUrl ? (
                    <Image src={participant.avatarUrl} alt={participant.fullName} fill className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                      {participant.fullName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{participant.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">{participant.email || participant.phoneNumber || participant.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {participant.unreadCount} unread • {participant.archived ? "Archived" : "Active"}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {detail.messages.map((message) => (
              <div key={message.id} className="rounded-lg border border-border/60 bg-muted/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{message.sender.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(message.sentAt)} • {formatRelative(message.sentAt)}
                    </p>
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium capitalize">
                    {message.type}
                  </span>
                </div>
                {message.text ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{message.text}</p> : null}
                {message.imageUrl ? (
                  <a href={message.imageUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">
                    Open attached image
                  </a>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
