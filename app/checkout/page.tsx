"use client"

import Image from "next/image"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

type CreditKind = "KEY" | "CHAT_CREDIT" | "VOICE_SESSION" | "VIDEO_SESSION"

type Info = {
  user: { fullName: string; phoneNumber: string | null } | null
  balances: { keys: number; chatCredits: number; voiceSessions: number; videoSessions: number }
  pricing: {
    purchaseKes: Record<CreditKind, number>
    minPurchase: Partial<Record<CreditKind, number>>
  }
}

const ITEMS: { kind: CreditKind; label: string; hint: string }[] = [
  { kind: "KEY", label: "Keys", hint: "Unlock a creator's first reply" },
  { kind: "CHAT_CREDIT", label: "ChatCredits", hint: "Each subsequent reply" },
  { kind: "VOICE_SESSION", label: "Voice Sessions", hint: "15-min voice call" },
  { kind: "VIDEO_SESSION", label: "Video Sessions", hint: "15-min video call" },
]

const BRAND = "#25d366"

function CheckoutInner() {
  const params = useSearchParams()
  const token = params.get("t") || ""

  const [info, setInfo] = useState<Info | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [qty, setQty] = useState<Record<CreditKind, number>>({
    KEY: 1,
    CHAT_CREDIT: 5,
    VOICE_SESSION: 0,
    VIDEO_SESSION: 0,
  })
  const [phone, setPhone] = useState("")
  const [stage, setStage] = useState<"build" | "paying" | "success" | "failed">("build")
  const [message, setMessage] = useState<string>("")

  useEffect(() => {
    if (!token) {
      setLoadError("Missing checkout link. Please reopen from the app.")
      return
    }
    fetch(`/api/checkout/info?t=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) {
          setLoadError(res.message || "This checkout link is invalid or expired.")
          return
        }
        setInfo(res.data)
        if (res.data.user?.phoneNumber) setPhone(res.data.user.phoneNumber)
      })
      .catch(() => setLoadError("Could not load checkout. Please try again."))
  }, [token])

  const prices = info?.pricing.purchaseKes
  const total = useMemo(() => {
    if (!prices) return 0
    return ITEMS.reduce((sum, it) => sum + prices[it.kind] * qty[it.kind], 0)
  }, [prices, qty])

  // Mirror the server's min-cart rule: if buying Keys or ChatCredits, you need
  // at least 1 Key and 5 ChatCredits together.
  const valid = useMemo(() => {
    if (total <= 0) return false
    const hasKeyOrChat = qty.KEY > 0 || qty.CHAT_CREDIT > 0
    if (hasKeyOrChat && (qty.KEY < 1 || qty.CHAT_CREDIT < 5)) return false
    return phone.trim().length >= 9
  }, [total, qty, phone])

  const minHint =
    (qty.KEY > 0 || qty.CHAT_CREDIT > 0) && (qty.KEY < 1 || qty.CHAT_CREDIT < 5)
      ? "Minimum is 1 Key and 5 ChatCredits."
      : ""

  const step = (kind: CreditKind, delta: number) =>
    setQty((q) => ({ ...q, [kind]: Math.max(0, q[kind] + delta) }))

  const pay = useCallback(async () => {
    setStage("paying")
    setMessage("Sending an M-PESA prompt to your phone…")
    try {
      const res = await fetch("/api/checkout/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, phone: phone.trim(), items: qty }),
      }).then((r) => r.json())

      if (!res.success) {
        setStage("failed")
        setMessage(res.message || "Could not start payment.")
        return
      }

      const purchaseId = res.data.purchaseId as string
      // Poll for allocation (the STK callback confirms payment).
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        const s = await fetch(
          `/api/checkout/purchase?t=${encodeURIComponent(token)}&purchaseId=${purchaseId}`,
        ).then((r) => r.json())
        if (s.success && s.data.status === "SUCCESS") {
          setStage("success")
          setMessage("Payment received — your credits have been added.")
          return
        }
        if (s.success && s.data.status === "FAILED") {
          setStage("failed")
          setMessage("Payment was not completed. Please try again.")
          return
        }
      }
      setStage("failed")
      setMessage("We didn't get a confirmation in time. If you paid, your credits will appear shortly.")
    } catch {
      setStage("failed")
      setMessage("Something went wrong. Please try again.")
    }
  }, [token, phone, qty])

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-6">
          <Image src="/chatandtip-logo-v2.png" alt="ChatAndTip" width={32} height={32} />
          <span className="text-lg font-bold">ChatAndTip</span>
        </div>

        <div className="rounded-2xl bg-white shadow-sm border border-neutral-200 p-6">
          {loadError ? (
            <p className="text-center text-sm text-red-600 py-10">{loadError}</p>
          ) : !info ? (
            <p className="text-center text-sm text-neutral-500 py-10">Loading…</p>
          ) : stage === "success" ? (
            <Result ok title="All set!" message={message} />
          ) : stage === "failed" ? (
            <Result title="Payment not completed" message={message} onRetry={() => setStage("build")} />
          ) : (
            <>
              <h1 className="text-xl font-bold">Recharge</h1>
              <p className="text-sm text-neutral-500 mt-1">
                {info.user?.fullName ? `For ${info.user.fullName}. ` : ""}Pay securely with M-PESA.
              </p>

              <div className="mt-5 space-y-3">
                {ITEMS.map((it) => (
                  <div key={it.kind} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{it.label}</p>
                      <p className="text-xs text-neutral-500 truncate">
                        {it.hint} · {prices?.[it.kind]} KES
                      </p>
                    </div>
                    <Stepper
                      value={qty[it.kind]}
                      onDec={() => step(it.kind, -1)}
                      onInc={() => step(it.kind, +1)}
                      disabled={stage === "paying"}
                    />
                  </div>
                ))}
              </div>

              {minHint && <p className="text-xs text-amber-600 mt-3">{minHint}</p>}

              <label className="block text-xs font-medium text-neutral-600 mt-5 mb-1">
                M-PESA phone number
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XX XXX XXX"
                inputMode="tel"
                disabled={stage === "paying"}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-[color:var(--brand)]"
                style={{ ["--brand" as string]: BRAND }}
              />

              <div className="flex items-center justify-between mt-5">
                <span className="text-sm text-neutral-500">Total</span>
                <span className="text-xl font-bold">{total.toLocaleString()} KES</span>
              </div>

              <button
                onClick={pay}
                disabled={!valid || stage === "paying"}
                className="w-full mt-4 rounded-xl py-3 font-semibold text-white disabled:opacity-50 transition"
                style={{ backgroundColor: BRAND }}
              >
                {stage === "paying" ? "Waiting for M-PESA…" : "Pay with M-PESA"}
              </button>

              {stage === "paying" && (
                <p className="text-xs text-neutral-500 text-center mt-3">{message}</p>
              )}

              <p className="text-[11px] text-neutral-400 text-center mt-4">
                Plus standard M-PESA transaction charges. Credits are added to your account once payment is confirmed.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Stepper({
  value,
  onDec,
  onInc,
  disabled,
}: {
  value: number
  onDec: () => void
  onInc: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={onDec}
        disabled={disabled || value <= 0}
        className="h-8 w-8 rounded-full border border-neutral-300 text-lg leading-none disabled:opacity-40"
      >
        −
      </button>
      <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
      <button
        onClick={onInc}
        disabled={disabled}
        className="h-8 w-8 rounded-full text-lg leading-none text-white"
        style={{ backgroundColor: BRAND }}
      >
        +
      </button>
    </div>
  )
}

function Result({
  ok,
  title,
  message,
  onRetry,
}: {
  ok?: boolean
  title: string
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="text-center py-8">
      <div
        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
        style={{ backgroundColor: ok ? `${BRAND}22` : "#fee2e2", color: ok ? BRAND : "#dc2626" }}
      >
        {ok ? "✓" : "!"}
      </div>
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-sm text-neutral-500 mt-2">{message}</p>
      {ok && (
        <p className="text-sm text-neutral-500 mt-4">You can close this page and return to the app.</p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 rounded-xl px-5 py-2.5 font-semibold text-white"
          style={{ backgroundColor: BRAND }}
        >
          Try again
        </button>
      )}
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<p className="text-center text-sm text-neutral-500 py-20">Loading…</p>}>
      <CheckoutInner />
    </Suspense>
  )
}
