"use client"

import Image from "next/image"
import Link from "next/link"
import { FormEvent, useState } from "react"

export default function SignupPage() {
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [accepted, setAccepted] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    if (!accepted) {
      setError("Please accept the Terms and Privacy Policy to continue.")
      return
    }
    setLoading(true)
    const form = new FormData(event.currentTarget)
    const response = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: form.get("fullName"),
        email: form.get("email"),
        password: form.get("password"),
        birthday: form.get("birthday"),
        acceptedTerms: accepted,
      }),
    })
    const result = await response.json()
    if (!response.ok || !result.success) {
      setError(result.message || "Unable to create account")
      setLoading(false)
      return
    }
    window.location.assign("/")
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-950">
      <section className="mx-auto max-w-md rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Image src="/chatandtip-logo.jpg" alt="ChatAndTip" width={54} height={34} className="h-9 w-14 object-contain" priority />
          <b className="text-lg">ChatAndTip</b>
        </div>

        <h1 className="text-center text-2xl font-black">Create your account</h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          You must be 18 or older to use ChatAndTip.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <Field label="Full name" name="fullName" type="text" autoComplete="name" required minLength={2} />
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={6} />
          <Field label="Date of birth" name="birthday" type="date" autoComplete="bday" required />

          <label className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-3">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#25d366]"
            />
            <span className="text-xs leading-5 text-neutral-600">
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="font-bold text-neutral-900 hover:underline">Terms and Conditions</Link>
              {" "}and{" "}
              <Link href="/privacy" target="_blank" className="font-bold text-neutral-900 hover:underline">Privacy Policy</Link>.
            </span>
          </label>

          {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

          <button
            disabled={loading || !accepted}
            className="w-full rounded-2xl bg-[#25d366] px-4 py-3 font-extrabold text-white disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-[#25d366] hover:underline">Sign in</Link>
        </p>
      </section>
    </main>
  )
}

function Field({
  label,
  name,
  type,
  autoComplete,
  required,
  minLength,
}: {
  label: string
  name: string
  type: string
  autoComplete?: string
  required?: boolean
  minLength?: number
}) {
  return (
    <label className="block text-sm font-bold">
      {label}
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className="mt-1.5 w-full rounded-2xl border border-neutral-200 px-4 py-3 font-normal outline-none focus:border-emerald-500"
      />
    </label>
  )
}
