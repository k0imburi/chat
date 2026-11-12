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
  return <div className="w-full overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-[0_22px_70px_rgba(0,0,0,.12)] dark:border-white/10 dark:bg-[#111513]">
    <div className="h-1.5 bg-[#25d366]" />
    <div className="p-6 sm:p-8">
    <div className="mx-auto grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm"><Image src="/chatandtip-logo.jpg" alt="ChatAndTip" width={82} height={52} className="h-12 w-14 object-contain" priority /></div>
    <h1 className="mt-5 text-center text-2xl font-black tracking-normal text-[#111513] dark:text-white">Welcome back</h1>
    <p className="mt-2 text-center text-sm leading-6 text-black/55 dark:text-white/55">Sign in to continue your conversations and discover what is new.</p>
    <form onSubmit={submit} className="mt-7 space-y-4">
      <label className="block text-sm font-bold text-black/75 dark:text-white/75">Email<input name="email" type="email" required autoComplete="email" className="mt-1.5 h-12 w-full rounded-xl border border-black/15 bg-white px-4 font-normal text-black outline-none ring-[#25d366]/25 transition focus:border-[#25d366] focus:ring-4 dark:border-white/15 dark:bg-white/[.06] dark:text-white" /></label>
      <label className="block text-sm font-bold text-black/75 dark:text-white/75">Password<input name="password" type="password" required minLength={6} autoComplete="current-password" className="mt-1.5 h-12 w-full rounded-xl border border-black/15 bg-white px-4 font-normal text-black outline-none ring-[#25d366]/25 transition focus:border-[#25d366] focus:ring-4 dark:border-white/15 dark:bg-white/[.06] dark:text-white" /></label>
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p> : null}
      <button disabled={loading} className="h-12 w-full rounded-xl bg-[#25d366] px-4 font-extrabold text-[#07150d] transition hover:bg-[#20bf5c] disabled:opacity-50">{loading ? "Signing in…" : "Sign in"}</button>
    </form>
    <div className="mt-5 flex items-center justify-between text-sm">
      <Link href="/forgot-password" className="text-black/55 hover:text-black dark:text-white/55 dark:hover:text-white">Forgot password?</Link>
      <Link href="/signup" className="font-bold text-[#159a49] hover:underline dark:text-[#45de7d]">Create account</Link>
    </div>
    <p className="mt-7 text-center text-xs text-black/35 dark:text-white/35">
      <Link href="/about" className="hover:underline">About</Link>
      {" · "}
      <Link href="/terms" className="hover:underline">Terms</Link>
      {" · "}
      <Link href="/privacy" className="hover:underline">Privacy</Link>
    </p>
    </div>
  </div>
}
