"use client"

import { useState } from "react"
import { PostGrid } from "@/components/customer/post-grid"
import type { CustomerFeedEntry } from "@/lib/customer-web"

export function ProfileTabs({ profileId, posts, user }: { profileId: string; posts: CustomerFeedEntry[]; user: CustomerFeedEntry["user"] }) {
  const [tab, setTab] = useState<"posts" | "tagged">("posts")
  const [entries, setEntries] = useState<CustomerFeedEntry[]>(posts)
  const [loading, setLoading] = useState(false)
  async function select(next: "posts" | "tagged") {
    setTab(next)
    if (next === "posts") { setEntries(posts); return }
    setLoading(true)
    try {
      const response = await fetch(`/api/mobile/profile/${next}?userId=${encodeURIComponent(profileId)}`, { cache: "no-store" })
      const data = await response.json()
      setEntries((data.data || []).map((video: Record<string, unknown>) => ({ user, video })) as CustomerFeedEntry[])
    } finally { setLoading(false) }
  }
  return <div><div className="mb-4 grid grid-cols-2 border-b border-black/10 dark:border-white/10">{(["posts", "tagged"] as const).map((item) => <button key={item} onClick={() => void select(item)} className={`border-b-2 px-3 py-3 text-sm font-bold capitalize ${tab === item ? "border-emerald-500 text-emerald-600" : "border-transparent text-black/45 dark:text-white/45"}`}>{item}</button>)}</div>{loading ? <p className="py-12 text-center text-sm text-neutral-500">Loading…</p> : <PostGrid entries={entries} empty={tab === "posts" ? "No posts yet." : `No ${tab} yet.`} />}</div>
}
