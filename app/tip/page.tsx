"use client"

import Image from "next/image"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

type TipInfo = {
  creator: { fullName: string }
  usd: number
  totalKes: number
  phoneNumber?: string
}

function TipInner() {
  const params = useSearchParams()
  const token = params.get("t") || "", creatorId = params.get("creator") || "", tier = params.get("tier") || ""
  const [info, setInfo] = useState<TipInfo | null>(null), [phone, setPhone] = useState(""), [message, setMessage] = useState("Loading…"), [paying, setPaying] = useState(false)
  useEffect(() => {
    const sessionRequest = token
      ? fetch("/api/checkout/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
          .then((r) => r.json())
          .then((s) => {
            if (!s.success) throw new Error(s.message)
            window.history.replaceState({}, "", `/tip?creator=${encodeURIComponent(creatorId)}&tier=${tier}`)
          })
      : Promise.resolve()
    sessionRequest
      .then(() => fetch(`/api/tip/info?creator=${encodeURIComponent(creatorId)}&tier=${tier}`))
      .then((r) => r.json()).then((r) => { if (!r.success) throw new Error(r.message); setInfo(r.data); setPhone(r.data.phoneNumber || ""); setMessage("") }).catch((e) => setMessage(e.message || "Could not load tip"))
  }, [token, creatorId, tier])
  async function pay() {
    setPaying(true); setMessage("Check your phone for the M-PESA prompt…")
    const response = await fetch("/api/tip/purchase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creatorId, tier, phone }) }).then((r) => r.json())
    if (!response.success) { setMessage(response.message || "Could not start payment"); setPaying(false); return }
    for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 3000)); const state = await fetch(`/api/tip/purchase?purchaseId=${response.data.purchaseId}`).then((r) => r.json()); if (state.data?.status === "SUCCESS") { setMessage("Tip sent — thank you!"); return } if (state.data?.status === "FAILED") break }
    setMessage("Payment was not confirmed. If you paid, it will update shortly."); setPaying(false)
  }
  return <main className="min-h-screen bg-neutral-50 px-4 py-10"><section className="mx-auto max-w-md rounded-3xl border bg-white p-6 shadow-sm">
    <div className="mb-6 flex items-center justify-center gap-2"><Image src="/chatandtip-logo-v2.png" alt="ChatAndTip" width={32} height={32}/><b>ChatAndTip</b></div>
    {info && <><div className="text-center"><Image src={`/icons/economy/${tier === "PEBBLE" ? "pebble" : tier === "GEM" ? "gem" : "diamond"}.svg`} alt="" width={60} height={60} className="mx-auto"/><h1 className="mt-3 text-2xl font-extrabold">Send {tier.toLowerCase()}</h1><p className="mt-1 text-neutral-500">to {info.creator.fullName}</p></div>
    <div className="mt-6 rounded-2xl bg-neutral-50 p-4"><div className="flex justify-between"><span>Tip</span><b>USD {info.usd}</b></div><div className="mt-2 flex justify-between"><span>M-PESA estimate</span><b>KES {info.totalKes}</b></div><p className="mt-3 text-xs text-neutral-500">The creator receives 50% after the 30-day maturity period.</p></div>
    <label className="mt-5 block text-xs font-semibold">M-PESA phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3"/>
    <button disabled={paying || phone.length < 9} onClick={pay} className="mt-4 w-full rounded-xl bg-emerald-500 py-3 font-bold text-white disabled:opacity-50">{paying ? "Waiting for M-PESA…" : "Send tip"}</button></>}
    {message && <p className="mt-4 text-center text-sm text-neutral-600">{message}</p>}
  </section></main>
}
export default function TipPage() { return <Suspense><TipInner/></Suspense> }
