import { PageHeader } from "@/components/page-header"
import { TechnicalIssuesTable } from "@/components/technical-issues-table"
import { getTechnicalIssues } from "@/lib/technical-issues"

export default async function TechnicalProblemsPage() {
  const issues = await getTechnicalIssues()
  return (
    <div className="space-y-5">
      <PageHeader
        title="Technical Problems"
        description="Problems submitted directly from the ChatAndTip app"
      />
      <TechnicalIssuesTable initialIssues={issues} />
    </div>
  )
}
