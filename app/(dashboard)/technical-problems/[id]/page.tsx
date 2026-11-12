import { notFound } from "next/navigation"
import { getTechnicalIssueAction } from "@/lib/actions/technical-issues"
import { SupportConversation } from "@/components/support-conversation"

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const issue = await getTechnicalIssueAction(id)
  if (!issue) notFound()
  return <SupportConversation initialIssue={issue} />
}
