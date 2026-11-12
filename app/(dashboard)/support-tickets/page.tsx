import { PageHeader } from "@/components/page-header"
import { TechnicalIssuesTable } from "@/components/technical-issues-table"
import { getTechnicalIssues } from "@/lib/technical-issues"

export default async function SupportTicketsPage() {
  const issues = await getTechnicalIssues("", "support")
  return (
    <div className="space-y-5">
      <PageHeader title="Support Inbox" description="Reply to conversations started by app users" />
      <TechnicalIssuesTable initialIssues={issues} queue="support" />
    </div>
  )
}
