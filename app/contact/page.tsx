"use client"

import Image from "next/image"
import { useState } from "react"

export default function ContactPage() {
  const [fullName, setFullName] = useState("")
  const [address, setAddress] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle")
  const [statusText, setStatusText] = useState("")

  const canSend =
    fullName.trim().length > 0 &&
    address.trim().length > 0 &&
    /.+@.+\..+/.test(email) &&
    phone.trim().length > 0 &&
    message.trim().length > 0 &&
    !sending

  async function submit() {
    setSending(true)
    setStatus("idle")
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, address, email, phone, message }),
      }).then((r) => r.json())
      if (!response.success) throw new Error(response.message || "Could not send your message")
      setStatus("sent")
      setFullName("")
      setAddress("")
      setEmail("")
      setPhone("")
      setMessage("")
    } catch (error) {
      setStatus("error")
      setStatusText(error instanceof Error ? error.message : "Could not send your message")
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10">
      <section className="mx-auto max-w-md rounded-3xl border bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Image
            src="/chatandtip-logo.jpg"
            alt="ChatAndTip"
            width={54}
            height={34}
            className="h-9 w-14 object-contain"
          />
          <b>ChatAndTip</b>
        </div>

        {status === "sent" ? (
          <div className="text-center">
            <h1 className="text-2xl font-extrabold">Message sent</h1>
            <p className="mt-2 text-neutral-500">
              Thanks for reaching out — we&apos;ll get back to you shortly.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-extrabold">Contact us</h1>
              <p className="mt-1 text-neutral-500">
                Send us a message and we&apos;ll respond by email.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold">Full name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border px-3 py-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-xl border px-3 py-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border px-3 py-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border px-3 py-3"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="w-full rounded-xl border px-3 py-3"
                />
              </div>
            </div>

            <button
              disabled={!canSend}
              onClick={submit}
              className="mt-5 w-full rounded-xl bg-emerald-500 py-3 font-bold text-white disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send message"}
            </button>

            {status === "error" && (
              <p className="mt-4 text-center text-sm text-red-500">{statusText}</p>
            )}
          </>
        )}
      </section>
    </main>
  )
}
