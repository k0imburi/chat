import { ActionForm } from "@/components/action-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/page-header"
import { AppModal } from "@/components/app-modal"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { DeliverNowButton } from "@/components/deliver-now-button"
import { createNotificationCampaignAction } from "@/lib/actions/notifications"
import { NOTIFICATION_CHANNEL_OPTIONS } from "@/lib/constants"
import { formatDateTime } from "@/lib/format"
import { getNotificationCampaigns } from "@/lib/queries"

type Campaign = Awaited<ReturnType<typeof getNotificationCampaigns>>[number]

const STATUS_STYLES: Record<string, string> = {
  SENT: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  DRAFT: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  FAILED: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400",
}

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
    render: (c) => {
      const isScheduled = c.status === "DRAFT" && c.scheduledAt && new Date(c.scheduledAt) > new Date()
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {isScheduled ? (
              <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400">
                scheduled
              </span>
            ) : (
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[c.status] ?? STATUS_STYLES.DRAFT}`}>
                {c.status.replace(/_/g, " ").toLowerCase()}
              </span>
            )}
            {(c.status === "DRAFT" || c.status === "FAILED") && (
              <DeliverNowButton campaignId={c.id} />
            )}
          </div>
          {isScheduled && c.scheduledAt && (
            <p className="text-xs text-muted-foreground">{formatDateTime(c.scheduledAt)}</p>
          )}
        </div>
      )
    },
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
            <ActionForm id="send-campaign-form" action={createNotificationCampaignAction} className="space-y-4">
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
              <div className="space-y-2">
                <Label htmlFor="audience">Audience</Label>
                <select id="audience" name="audience" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="all">All users</option>
                  <option value="fans">Fans only</option>
                  <option value="creators">Creators only</option>
                  <option value="verified">Verified users</option>
                  <option value="custom">Custom ID list</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="genderFilter">Gender filter (optional)</Label>
                <select id="genderFilter" name="genderFilter" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="">Any gender</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="createdAfter">Joined after (optional)</Label>
                <Input id="createdAfter" name="createdAfter" type="date" className="w-full" />
                <p className="text-xs text-muted-foreground">Only reach users who joined after this date.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="userIds">Custom user IDs (comma-separated)</Label>
                <textarea
                  id="userIds"
                  name="userIds"
                  className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Only used when Audience = Custom ID list"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledAt">Schedule for (optional)</Label>
                <Input
                  id="scheduledAt"
                  name="scheduledAt"
                  type="datetime-local"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">Leave blank to send immediately.</p>
              </div>
            </ActionForm>
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
