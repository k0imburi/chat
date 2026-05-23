import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/page-header"
import { AppModal } from "@/components/app-modal"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { createNotificationCampaignAction } from "@/lib/actions/notifications"
import { NOTIFICATION_CHANNEL_OPTIONS } from "@/lib/constants"
import { formatDateTime } from "@/lib/format"
import { getNotificationCampaigns } from "@/lib/queries"

type Campaign = Awaited<ReturnType<typeof getNotificationCampaigns>>[number]

const columns: DataTableColumn<Campaign>[] = [
  {
    key: "campaign",
    header: "Campaign",
    render: (c) => (
      <div>
        <p className="font-medium">{c.title || "Untitled campaign"}</p>
        <p className="text-xs text-muted-foreground capitalize">{c.channel.replace(/_/g, " ").toLowerCase()}</p>
      </div>
    ),
  },
  {
    key: "message",
    header: "Message",
    cellClassName: "max-w-xs",
    render: (c) => (
      <p className="line-clamp-2 text-sm text-muted-foreground">{c.message}</p>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (c) => (
      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium capitalize text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
        {c.status.replace(/_/g, " ").toLowerCase()}
      </span>
    ),
  },
  {
    key: "sent-by",
    header: "Sent by",
    render: (c) => <span className="text-sm">{c.createdBy.fullName}</span>,
  },
  {
    key: "date",
    header: "Date",
    render: (c) => <span className="text-sm text-muted-foreground">{formatDateTime(c.sentAt ?? c.createdAt)}</span>,
  },
]

export default async function NotificationsPage() {
  const campaigns = await getNotificationCampaigns()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notifications"
        title="Broadcast center"
        description="Manage and track notification campaigns delivered across in-app, email, SMS, and webhook channels."
        actions={
          <AppModal
            trigger={<Button>Send campaign</Button>}
            title="Send notification campaign"
            description="Create a broadcast campaign for in-app, email, SMS, or webhook delivery."
            footer={
              <Button type="submit" form="send-campaign-form" size="sm">
                Send campaign
              </Button>
            }
          >
            <form id="send-campaign-form" action={createNotificationCampaignAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notif-title">Title</Label>
                <Input id="notif-title" name="title" placeholder="Optional title" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel">Channel</Label>
                <select id="channel" name="channel" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  {NOTIFICATION_CHANNEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <textarea
                  id="message"
                  name="message"
                  required
                  className="min-h-32 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Write the campaign message to be delivered..."
                />
              </div>
            </form>
          </AppModal>
        }
      />

      <DataTable
        rows={campaigns}
        columns={columns}
        getRowKey={(c) => c.id}
        emptyTitle="No campaigns sent"
        emptyDescription="Campaigns you send will appear here."
      />
    </div>
  )
}
