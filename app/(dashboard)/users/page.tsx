import { PageHeader } from "@/components/page-header"
import { UsersTable } from "@/components/users-table"
import { getUsers } from "@/lib/queries"

export default async function UsersPage() {
  const data = await getUsers({})

  return (
    <div className="space-y-5">
      <PageHeader title="Users" description="Search, filter, and manage all platform accounts" />
      <UsersTable initialData={data} />
    </div>
  )
}
