"use client"

import { useEffect, useState } from "react"

export function DashboardGreeting() {
  const [greeting, setGreeting] = useState("Good day")

  useEffect(() => {
    const h = new Date().getHours()
    if (h < 12) setGreeting("Good morning")
    else if (h < 17) setGreeting("Good afternoon")
    else setGreeting("Good evening")
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">
        {greeting}, <span className="text-primary">Admin</span>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Here&apos;s what&apos;s happening on your platform today.
      </p>
    </div>
  )
}
