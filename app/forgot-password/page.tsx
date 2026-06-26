"use client"

import Image from "next/image"
import Link from "next/link"
import { FormEvent, useState } from "react"

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage("")
    const form = new FormData(event.currentTarget)
    const response = await fetch("/api/mobile/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: String(form.get("identifier") || "") }),
    }).then((r) => r.json())
    setLoading(false)
    setMessage(response.message || (response.success ? "If an account exists, recovery instructions have been sent." : "Could not send recovery instructions."))
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-950">
      <section className="mx-auto max-w-md rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Image src="/chatandtip-logo.jpg" alt="ChatAndTip" width={54} height={34} className="h-9 w-14 object-contain" />
          <b className="text-lg">ChatAndTip</b>
        </div>
        <h1 className="text-3xl font-black">Recover access</h1>
        <p className="mt-2 text-sm text-neutral-500">Enter your email or phone number. If we find your account, we’ll send recovery instructions.</p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input name="identifier" required placeholder="Email or phone number" className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-emerald-500" />
          <button disabled={loading} className="w-full rounded-2xl bg-neutral-950 px-4 py-3 font-black text-white disabled:opacity-60">
            {loading ? "Sending…" : "Send instructions"}
          </button>
        </form>
        {message ? <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
        <p className="mt-6 text-center text-sm text-neutral-500"><Link href="/login" className="font-black text-emerald-700">Back to sign in</Link></p>
      </section>
    </main>
  )
}
