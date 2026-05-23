"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { SidebarIcon } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import type { SessionUser } from "@/lib/auth"

const idLike = (s: string) => s.length > 16 && /^[a-zA-Z0-9_-]+$/.test(s) && !/^[a-z-]+$/.test(s)

function toLabel(segment: string) {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function AdminHeader({ session }: { session: SessionUser }) {
  const pathname = usePathname()
  const [pageTitle, setPageTitle] = useState("")

  useEffect(() => {
    setPageTitle(document.title.split(" | ")[0].trim())
  }, [pathname])

  const segments = pathname.split("/").filter(Boolean)
  const initials = getInitials(session.name)

  return (
    <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-14">
      {/* Left — trigger + breadcrumb */}
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground">
          <SidebarIcon className="h-4 w-4" />
        </SidebarTrigger>
        <Separator orientation="vertical" className="mr-2 h-4" />

        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
                  Admin
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {segments.map((segment, index) => {
              const href = `/${segments.slice(0, index + 1).join("/")}`
              const isLast = index === segments.length - 1
              const label = isLast && idLike(segment) && pageTitle ? pageTitle : toLabel(segment)

              return (
                <div key={href} className="flex items-center">
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage className="font-medium text-foreground">{label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={href} className="text-muted-foreground hover:text-foreground">
                          {label}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </div>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Right — user pill */}
      <div className="flex items-center gap-3 pr-4">
        <div className="hidden flex-col items-end sm:flex">
          <span className="text-xs font-semibold leading-none text-foreground">{session.name}</span>
          <span className="mt-0.5 text-[10px] leading-none text-muted-foreground">
            {session.role.replace(/_/g, " ")}
          </span>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground ring-2 ring-primary/20">
          {initials}
        </div>
      </div>
    </header>
  )
}
