"use client"

import * as React from "react"
import Image from "next/image"
import { ChevronsUpDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

type Team = {
  name: string
  logo: React.ElementType | string
  plan: string
}

function TeamLogo({ logo, name, size }: { logo: Team["logo"]; name: string; size: number }) {
  if (typeof logo === "string") {
    return <Image src={logo} alt={name} width={size} height={size} className="object-contain" />
  }

  const LogoIcon = logo
  return <LogoIcon className={size === 24 ? "size-4" : "size-3.5"} />
}

function TeamButton({ team, withChevron }: { team: Team; withChevron?: boolean }) {
  return (
    <SidebarMenuButton
      size="lg"
      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
    >
      <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg border bg-sidebar-primary text-sidebar-primary-foreground">
        <TeamLogo logo={team.logo} name={team.name} size={24} />
      </div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{team.name}</span>
        <span className="truncate text-xs">{team.plan}</span>
      </div>
      {withChevron ? <ChevronsUpDown className="ml-auto" /> : null}
    </SidebarMenuButton>
  )
}

export function TeamSwitcher({ teams }: { teams: Team[] }) {
  const { isMobile } = useSidebar()
  const [activeTeam, setActiveTeam] = React.useState(teams[0])

  if (!activeTeam) {
    return null
  }

  if (teams.length <= 1) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <TeamButton team={activeTeam} />
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TeamButton team={activeTeam} withChevron />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>
            {teams.map((team) => (
              <DropdownMenuItem
                key={team.name}
                onClick={() => setActiveTeam(team)}
                className="gap-2 p-2"
              >
                <div className="flex size-6 items-center justify-center overflow-hidden rounded-md border">
                  <TeamLogo logo={team.logo} name={team.name} size={16} />
                </div>
                {team.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
