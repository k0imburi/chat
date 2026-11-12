import { notFound } from "next/navigation"
import { SupportConversation } from "@/components/support-conversation"
import { getTechnicalIssueAction } from "@/lib/actions/technical-issues"

export default async function SupportTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const issue = await getTechnicalIssueAction(id)
  if (!issue || !issue.subject.startsWith("Support chat · C#")) notFound()
  return <SupportConversation initialIssue={issue} backHref="/support-tickets" backLabel="Support Inbox" />
}
