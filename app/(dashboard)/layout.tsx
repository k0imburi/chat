import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { AdminHeader } from "@/components/admin-header"
import { requireSessionUser } from "@/lib/auth"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await requireSessionUser()

  return (
    <SidebarProvider>
      <AppSidebar session={session} />
      <SidebarInset>
        <AdminHeader session={session} />
        <div className="flex flex-1 flex-col gap-4 px-5 pb-10 pt-8 xl:px-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
