"use client"

import { useEffect, useMemo, useState } from "react"
import type { ReactElement } from "react"
import { BarChart3, ChevronRight, Clock3, Eye, MousePointerClick, Plus, RefreshCw, Repeat2, Sparkles, WalletCards } from "lucide-react"

type Campaign = {
  id: string
  name?: string
  status?: string
  reviewStatus?: string
  deliveryState?: string
  budget?: number
  funded?: number
  spend?: number
  remaining?: number
  impressions?: number
  clicks?: number
  engagements?: number
  endDate?: string | null
  startDate?: string | null
  autoRenew?: boolean
  actualCpm?: number
  actualCpc?: number
  actualCpe?: number
  websiteUrl?: string
}

export function AdsCenter() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const response = await fetch("/api/mobile/ads", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Unable to load campaigns")
      setCampaigns(data.data || [])
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load campaigns")
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const totals = useMemo(() => campaigns.reduce((sum, campaign) => ({
    spend: sum.spend + (campaign.spend ?? 0),
    impressions: sum.impressions + (campaign.impressions ?? 0),
    clicks: sum.clicks + (campaign.clicks ?? 0),
  }), { spend: 0, impressions: 0, clicks: 0 }), [campaigns])

  return (
    <main className="h-full overflow-y-auto bg-[#f7f8fa] px-4 pb-28 pt-16 text-neutral-950 dark:bg-[#090b0a] dark:text-white sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#16a653]">Advertise</p><h1 className="mt-1 text-3xl font-black tracking-tight">Ads Center</h1></div>
          <button onClick={() => void load()} aria-label="Refresh campaigns" className="grid h-11 w-11 place-items-center rounded-full bg-white text-neutral-500 shadow-sm ring-1 ring-black/5 hover:bg-black/5 dark:bg-white/10 dark:text-white/60 dark:ring-white/10"><RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} /></button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Summary label="Spent" value={`$${totals.spend.toFixed(2)}`} icon={<WalletCards />} />
          <Summary label="Views" value={compact(totals.impressions)} icon={<Eye />} />
          <Summary label="Clicks" value={compact(totals.clicks)} icon={<MousePointerClick />} />
        </div>

        <a href="/ads/create" className="my-6 flex h-13 items-center justify-center gap-2 rounded-2xl bg-[#25d366] font-extrabold text-white shadow-lg shadow-emerald-500/20"><Plus className="h-5 w-5" /> Create Ad</a>

        {loading && !campaigns.length ? <div className="py-16 text-center text-sm text-neutral-500">Loading campaigns…</div> : error ? <div className="rounded-2xl bg-rose-500/10 p-4 text-center text-sm font-semibold text-rose-600">{error}</div> : campaigns.length === 0 ? <div className="rounded-3xl border border-dashed border-black/10 bg-white px-6 py-16 text-center dark:border-white/10 dark:bg-white/[0.04]"><Sparkles className="mx-auto h-9 w-9 text-black/15 dark:text-white/15" /><p className="mt-3 text-sm font-extrabold">No campaigns on this account yet</p><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-neutral-500">Ads are private to the account that created or boosted them. Create an ad while signed into this account and its live metrics will appear here.</p></div> : <div className="space-y-4">{campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} onChanged={load} />)}</div>}
      </div>
    </main>
  )
}

function Summary({ label, value, icon }: { label: string; value: string; icon: ReactElement }) {
  return <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.06] dark:ring-white/10"><div className="h-4 w-4 text-[#16a653]">{icon}</div><p className="mt-3 text-lg font-black">{value}</p><p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">{label}</p></div>
}

function CampaignCard({ campaign, onChanged }: { campaign: Campaign; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const state = campaign.deliveryState || campaign.reviewStatus || campaign.status || "DRAFT"
  const active = state.toLowerCase() === "running" || campaign.status === "ACTIVE"
  const ended = campaign.status === "COMPLETED" || (campaign.endDate ? new Date(campaign.endDate).getTime() <= Date.now() : false) || (campaign.remaining ?? 0) <= 0
  const budget = Math.max(campaign.funded ?? campaign.budget ?? 0, campaign.budget ?? 0)
  const spend = campaign.spend ?? 0
  const progress = budget > 0 ? Math.min(100, Math.max(0, spend / budget * 100)) : 0

  async function action(actionName: "set_auto_renew" | "republish", enabled?: boolean) {
    setBusy(actionName)
    setMessage(null)
    try {
      const response = await fetch(`/api/mobile/ads/${campaign.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName, enabled, ...(actionName === "republish" ? { requestKey: crypto.randomUUID() } : {}) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Could not update this campaign")
      if (data.data?.checkoutUrl) window.location.href = data.data.checkoutUrl
      else await onChanged()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not update this campaign")
    } finally { setBusy(null) }
  }

  return <article className="overflow-hidden rounded-[24px] bg-white shadow-sm ring-1 ring-black/[0.07] dark:bg-white/[0.055] dark:ring-white/10">
    <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-start gap-3 p-5 text-left">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#25d366]/12 text-[#16a653]"><BarChart3 className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1"><h2 className="truncate text-[15px] font-extrabold">{campaign.name || "Untitled campaign"}</h2><div className="mt-1.5 flex items-center gap-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${active ? "bg-[#25d366]/12 text-[#15984c]" : ended ? "bg-neutral-500/10 text-neutral-500" : "bg-amber-500/12 text-amber-600"}`}>{state.replaceAll("_", " ")}</span>{campaign.endDate ? <span className="flex items-center gap-1 text-[11px] text-neutral-400"><Clock3 className="h-3 w-3" />{timeRemaining(campaign.endDate)}</span> : null}</div></div>
      <ChevronRight className={`mt-2 h-5 w-5 text-neutral-400 transition ${expanded ? "rotate-90" : ""}`} />
    </button>
    <div className="px-5 pb-5">
      <div className="grid grid-cols-3 gap-2"><Metric label="Spent" value={`$${spend.toFixed(2)}`} /><Metric label="Remaining" value={`$${(campaign.remaining ?? 0).toFixed(2)}`} /><Metric label="Impressions" value={compact(campaign.impressions ?? 0)} /></div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10"><div className="h-full rounded-full bg-[#25d366]" style={{ width: `${progress}%` }} /></div>
      {expanded ? <div className="mt-4 grid grid-cols-3 gap-2 border-t border-black/[0.07] pt-4 dark:border-white/10"><Metric label="Clicks" value={compact(campaign.clicks ?? 0)} /><Metric label="Engagements" value={compact(campaign.engagements ?? 0)} /><Metric label="CPM" value={`$${(campaign.actualCpm ?? 0).toFixed(2)}`} /></div> : null}
      {message ? <p className="mt-4 rounded-xl bg-rose-500/10 p-3 text-xs font-semibold text-rose-600">{message}</p> : null}
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-black/[0.07] pt-4 dark:border-white/10"><div><p className="text-sm font-extrabold">Auto-renew</p><p className="mt-0.5 text-[11px] text-neutral-400">Continue after the end date</p></div><button type="button" role="switch" aria-checked={Boolean(campaign.autoRenew)} disabled={busy !== null} onClick={() => void action("set_auto_renew", !campaign.autoRenew)} className={`relative h-7 w-12 rounded-full transition ${campaign.autoRenew ? "bg-[#25d366]" : "bg-neutral-300 dark:bg-white/20"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${campaign.autoRenew ? "left-6" : "left-1"}`} /></button></div>
      {ended ? <button type="button" disabled={busy !== null} onClick={() => void action("republish")} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#25d366] text-sm font-extrabold text-[#16a653] disabled:opacity-50"><Repeat2 className="h-4 w-4" />{busy === "republish" ? "Preparing…" : "Republish ad"}</button> : null}
    </div>
  </article>
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-black/[0.035] px-2 py-3 text-center dark:bg-white/[0.055]"><p className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">{label}</p><p className="mt-1 text-xs font-black">{value}</p></div> }
function compact(value: number) { return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value) }
function timeRemaining(endDate: string) { const ms = new Date(endDate).getTime() - Date.now(); if (ms <= 0) return "Ended"; const days = Math.floor(ms / 86400000); const hours = Math.floor(ms % 86400000 / 3600000); return days ? `${days}d ${hours}h left` : `${hours}h left` }
