"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { AppModal } from "@/components/app-modal"
import { RoleBadge } from "@/components/status-badge"
import { createAdminUserAction } from "@/lib/actions/settings"
import { ADMIN_ROLE_OPTIONS } from "@/lib/constants"
import { formatDateTime, formatRelative } from "@/lib/format"

type AdminUser = {
  id: string
  fullName: string
  email: string | null
  role: string
  isActive: boolean
  lastLoginAt: Date | null
  createdAt: Date
}

export function AdminTable({ adminUsers }: { adminUsers: AdminUser[] }) {
  const [query, setQuery] = useState("")

  const filtered = query
    ? adminUsers.filter(
        (a) =>
          a.fullName.toLowerCase().includes(query.toLowerCase()) ||
          (a.email ?? "").toLowerCase().includes(query.toLowerCase()),
      )
    : adminUsers

  const columns: DataTableColumn<AdminUser>[] = [
    {
      key: "fullName",
      header: "Name",
      render: (admin) => (
        <div>
          <p className="font-medium">{admin.fullName}</p>
          <p className="text-xs text-muted-foreground">{admin.email || "No email set"}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (admin) => <RoleBadge value={admin.role} />,
    },
    {
      key: "status",
      header: "Status",
      render: (admin) => (
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
            admin.isActive
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400"
          }`}
        >
          {admin.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "last-login",
      header: "Last login",
      render: (admin) =>
        admin.lastLoginAt ? (
          formatRelative(admin.lastLoginAt)
        ) : (
          <span className="text-muted-foreground">Never</span>
        ),
    },
    {
      key: "joined",
      header: "Joined",
      render: (admin) => formatDateTime(admin.createdAt),
    },
  ]

  const toolbar = (
    <div className="flex items-center gap-2.5">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email..."
          className="h-9 pl-9"
        />
      </div>
      <AppModal
        trigger={<Button size="sm">Create admin</Button>}
        title="Create admin user"
        description="Add a new admin account with a role-ready structure."
        footer={
          <Button type="submit" form="create-admin-form" size="sm">
            Create admin user
          </Button>
        }
      >
        <form id="create-admin-form" action={createAdminUserAction} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select id="role" name="role" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
              {ADMIN_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </form>
      </AppModal>
    </div>
  )

  return (
    <DataTable
      toolbar={toolbar}
      rows={filtered}
      columns={columns}
      getRowKey={(admin) => admin.id}
      emptyTitle="No admins found"
      emptyDescription="No admin accounts match your search."
    />
  )
}
