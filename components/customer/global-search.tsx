"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Loader2, Search, UserRound } from "lucide-react"
import { VerifiedBadge } from "@/components/customer/verified-badge"

type SearchUser = { userId: string; fullname?: string; username?: string; profileAvatarUrl?: string; bio?: string; verified?: number; isBroadcaster?: boolean; followersCount?: number }
type SearchPost = { user: SearchUser; video: { id: string; thumbnailUrl?: string; imageUrl?: string; images?: string[]; videoUrl?: string; caption?: string; title?: string; likes?: number; views?: number } }

export function GlobalSearch() {
  const [query, setQuery] = useState("")
  const [users, setUsers] = useState<SearchUser[]>([])
  const [posts, setPosts] = useState<SearchPost[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const needle = query.trim()
    if (needle.length < 2) { setUsers([]); setPosts([]); setLoading(false); return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/mobile/search?q=${encodeURIComponent(needle)}`, { signal: controller.signal })
        const payload = await response.json()
        if (response.ok) { setUsers(payload.data?.users || []); setPosts(payload.data?.posts || []) }
      } catch {}
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  return <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-[#101312]">
    <header className="border-b border-black/8 p-5 dark:border-white/10 sm:p-7"><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#16a653]">Explore</p><h1 className="mt-1 text-3xl font-black">Search</h1><div className="relative mt-5"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black/35 dark:text-white/35" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, captions and posts" className="h-13 w-full rounded-2xl border-0 bg-black/[0.045] pl-12 pr-12 text-sm font-semibold outline-none ring-[#25d366]/40 focus:ring-2 dark:bg-white/[0.07]" />{loading ? <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#16a653]" /> : null}</div></header>
    <div className="p-5 sm:p-7">
      {query.trim().length < 2 ? <div className="py-20 text-center"><Search className="mx-auto h-10 w-10 text-black/15 dark:text-white/15" /><p className="mt-3 text-sm font-semibold text-black/40 dark:text-white/40">Type at least two characters to search ChatAndTip.</p></div> : null}
      {users.length ? <section><h2 className="text-xs font-black uppercase tracking-[0.16em] text-black/35 dark:text-white/35">People</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{users.map((user) => <Link href={`/profiles/${user.userId}`} key={user.userId} className="flex items-center gap-3 rounded-2xl border border-black/[0.07] p-3 hover:bg-black/[0.025] dark:border-white/10 dark:hover:bg-white/[0.04]"><div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-black/5 dark:bg-white/10">{user.profileAvatarUrl ? <img src={user.profileAvatarUrl} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 text-black/25 dark:text-white/25" />}</div><div className="min-w-0"><div className="flex items-center gap-1.5"><p className="truncate text-sm font-extrabold">{user.fullname || user.username}</p><VerifiedBadge verified={user.verified} isBroadcaster={user.isBroadcaster} className="h-4 w-4" /></div><p className="truncate text-xs text-black/45 dark:text-white/45">@{user.username}</p></div></Link>)}</div></section> : null}
      {posts.length ? <section className={users.length ? "mt-7" : ""}><h2 className="text-xs font-black uppercase tracking-[0.16em] text-black/35 dark:text-white/35">Posts</h2><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{posts.map(({ video }) => { const preview = video.thumbnailUrl || video.imageUrl || video.images?.[0]; return <Link href={`/reels/${video.id}`} key={video.id} className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black/5 dark:bg-white/10">{preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-black/30 dark:text-white/30">Video</div>}<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10"><p className="line-clamp-2 text-xs font-bold text-white">{video.caption || video.title || "Post"}</p></div></Link> })}</div></section> : null}
      {!loading && query.trim().length >= 2 && !users.length && !posts.length ? <p className="py-20 text-center text-sm font-semibold text-black/40 dark:text-white/40">No results for “{query.trim()}”.</p> : null}
    </div>
  </section>
}
