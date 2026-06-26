"use client"

import { FormEvent, useState } from "react"
import Image from "next/image"
import Link from "next/link"

export function CustomerLoginForm() {
  const [error, setError] = useState(""), [loading, setLoading] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("")
    const form = new FormData(event.currentTarget)
    const response = await fetch("/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) })
    const result = await response.json()
    if (!response.ok || !result.success) { setError(result.message || "Unable to sign in"); setLoading(false); return }
    window.location.assign("/")
  }
  return <div className="w-full rounded-3xl border border-black/5 bg-white p-6 shadow-xl sm:p-8">
    <Image src="/chatandtip-logo.jpg" alt="ChatAndTip" width={82} height={52} className="mx-auto h-14 w-24 object-contain" priority />
    <h1 className="mt-4 text-center text-2xl font-black">Welcome to ChatAndTip</h1>
    <p className="mt-2 text-center text-sm text-neutral-500">Sign in to discover creators and continue your conversations.</p>
    <form onSubmit={submit} className="mt-7 space-y-4">
      <label className="block text-sm font-bold">Email<input name="email" type="email" required autoComplete="email" className="mt-1.5 w-full rounded-2xl border border-neutral-200 px-4 py-3 font-normal outline-none focus:border-emerald-500" /></label>
      <label className="block text-sm font-bold">Password<input name="password" type="password" required minLength={6} autoComplete="current-password" className="mt-1.5 w-full rounded-2xl border border-neutral-200 px-4 py-3 font-normal outline-none focus:border-emerald-500" /></label>
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <button disabled={loading} className="w-full rounded-2xl bg-[#25d366] px-4 py-3 font-extrabold text-white disabled:opacity-50">{loading ? "Signing in…" : "Sign in"}</button>
    </form>
    <div className="mt-5 flex justify-between text-sm"><Link href="/forgot-password" className="text-neutral-500">Forgot password?</Link><Link href="/signup" className="font-bold text-emerald-700">Create account</Link></div>
  </div>
}
