import { PageHeader } from "@/components/page-header"
import { ReportsTable } from "@/components/reports-table"
import { getReports } from "@/lib/queries"

export default async function ReportsPage() {
  const reports = await getReports()

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" description="User-submitted moderation reports" />
      <ReportsTable initialReports={reports} />
    </div>
  )
}
