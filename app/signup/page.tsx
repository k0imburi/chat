"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"

export default function SignupPage() {
  const router = useRouter()
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage("")
    const form = new FormData(event.currentTarget)
    const response = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: String(form.get("fullName") || ""),
        email: String(form.get("email") || ""),
        password: String(form.get("password") || ""),
        phoneNumber: String(form.get("phoneNumber") || ""),
        username: String(form.get("username") || ""),
      }),
    }).then((r) => r.json())
    setLoading(false)
    if (!response.success) {
      setMessage(response.message || "Could not create account")
      return
    }
    router.replace("/")
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-950">
      <section className="mx-auto max-w-md rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Image src="/chatandtip-logo-v2.png" alt="ChatAndTip" width={34} height={34} />
          <b className="text-lg">ChatAndTip</b>
        </div>
        <h1 className="text-3xl font-black">Create your account</h1>
        <p className="mt-2 text-sm text-neutral-500">Join the app, post, follow creators, top up, book sessions, and manage your wallet from the web.</p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input name="fullName" required placeholder="Full name" className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-emerald-500" />
          <input name="username" placeholder="Username" className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-emerald-500" />
          <input name="email" type="email" required placeholder="Email" className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-emerald-500" />
          <input name="phoneNumber" inputMode="tel" placeholder="Phone number for M-PESA prompts" className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-emerald-500" />
          <input name="password" type="password" required minLength={6} placeholder="Password" className="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none focus:border-emerald-500" />
          <button disabled={loading} className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-black text-white disabled:opacity-60">
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        {message ? <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">{message}</p> : null}
        <p className="mt-6 text-center text-sm text-neutral-500">Already have an account? <Link href="/login" className="font-black text-emerald-700">Sign in</Link></p>
      </section>
    </main>
  )
}
