import { PageHeader } from "@/components/page-header"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { DeliverNowButton } from "@/components/deliver-now-button"
import { NotificationCampaignModal } from "@/components/notification-campaign-modal"
import { NotificationSoundManager } from "@/components/notification-sound-manager"
import { prisma } from "@/lib/prisma"
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
  const [campaigns, sounds] = await Promise.all([
    getNotificationCampaigns(),
    prisma.notificationSound.findMany({ orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }] }),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notifications"
        title="Broadcast center"
        description="Manage and track notification campaigns delivered across in-app, email, SMS, and webhook channels."
        actions={<NotificationCampaignModal />}
      />

      <DataTable
        rows={campaigns}
        columns={columns}
        getRowKey={(c) => c.id}
        emptyTitle="No campaigns sent"
        emptyDescription="Campaigns you send will appear here."
      />
      <NotificationSoundManager sounds={sounds} />
    </div>
  )
}
