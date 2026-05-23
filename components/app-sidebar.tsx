"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { SessionUser } from "@/lib/auth"
import { NAV_ITEMS } from "@/lib/constants"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export function AppSidebar({
  session,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  session: SessionUser
}) {
  const pathname = usePathname()
  const teams = [
    {
      name: "ChatAndTip",
      logo: "/chatandtip-logo-v2.png",
      plan: session.role.replace(/_/g, " "),
    },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.url || pathname.startsWith(`${item.url}/`)
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={active}
                >
                  <Link href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: session.name,
            email: session.email ?? "",
            avatar: session.avatarUrl || "/placeholder-user.jpg",
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
