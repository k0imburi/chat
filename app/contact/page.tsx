"use client"

import Image from "next/image"
import { useState } from "react"
import {
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  User,
} from "lucide-react"

const FIELDS = [
  { key: "fullName", label: "Full name", type: "text", icon: User, autoComplete: "name" },
  { key: "address", label: "Address", type: "text", icon: MapPin, autoComplete: "street-address" },
  { key: "email", label: "Email", type: "email", icon: Mail, autoComplete: "email" },
  { key: "phone", label: "Phone", type: "tel", icon: Phone, autoComplete: "tel" },
] as const

type FieldKey = (typeof FIELDS)[number]["key"]

export default function ContactPage() {
  const [values, setValues] = useState<Record<FieldKey, string>>({
    fullName: "",
    address: "",
    email: "",
    phone: "",
  })
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle")
  const [statusText, setStatusText] = useState("")

  function setField(key: FieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const canSend =
    values.fullName.trim().length > 0 &&
    values.address.trim().length > 0 &&
    /.+@.+\..+/.test(values.email) &&
    values.phone.trim().length > 0 &&
    message.trim().length > 0 &&
    !sending

  async function submit() {
    setSending(true)
    setStatus("idle")
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, message }),
      }).then((r) => r.json())
      if (!response.success) throw new Error(response.message || "Could not send your message")
      setStatus("sent")
      setValues({ fullName: "", address: "", email: "", phone: "" })
      setMessage("")
    } catch (error) {
      setStatus("error")
      setStatusText(error instanceof Error ? error.message : "Could not send your message")
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#FAFAF8] px-4 py-12 text-neutral-900 sm:py-16">
      {/* A single flat wash, not a neon glow — keeps depth without the
          gradient-blob look. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_15%_0%,rgba(47,143,59,0.06),transparent)]" />

      <div className="relative mx-auto grid w-full max-w-5xl min-w-0 gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        {/* ── Left: brand / info panel ───────────────────────── */}
        <div className="flex min-w-0 flex-col justify-center">
          <div className="flex items-center gap-3">
            <Image
              src="/chatandtip-logo-v2.png"
              alt="ChatAndTip"
              width={44}
              height={44}
              className="h-11 w-11 rounded-xl"
              priority
            />
            <span className="text-lg font-bold tracking-tight">ChatAndTip</span>
          </div>

          <h1 className="mt-8 text-4xl font-black leading-[1.1] tracking-tight sm:text-5xl">
            Let&apos;s talk.
            <br />
            <span className="text-[#2F8F3B]">We&apos;re listening.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-neutral-500">
            Questions, feedback, or something urgent — send us a message and
            our team will get back to you by email.
          </p>

          <div className="mt-10 space-y-4">
            <InfoRow icon={Mail} label="Email us" value="admin@chatandtip.com" />
            <InfoRow icon={Clock} label="Response time" value="Usually within 24 hours" />
            <InfoRow icon={MessageCircle} label="Best for" value="Support, partnerships & feedback" />
          </div>
        </div>

        {/* ── Right: form card ───────────────────────────────── */}
        <div className="min-w-0 rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl shadow-neutral-200/60 sm:p-8">
          {status === "sent" ? (
            <div className="flex min-h-[26rem] flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2F8F3B]/10">
                <CheckCircle2 className="h-9 w-9 text-[#2F8F3B]" />
              </div>
              <h2 className="mt-5 text-2xl font-bold">Message sent</h2>
              <p className="mt-2 max-w-xs text-sm text-neutral-500">
                Thanks for reaching out — we&apos;ll get back to you shortly.
              </p>
              <button
                onClick={() => setStatus("idle")}
                className="mt-6 rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-700 transition hover:border-neutral-400 hover:text-neutral-900"
              >
                Send another message
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold">Send a message</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Fill in your details below.
              </p>

              <div className="mt-6 space-y-4">
                {FIELDS.map(({ key, label, type, icon: Icon, autoComplete }) => (
                  <div key={key}>
                    <label className="mb-1.5 block text-xs font-semibold text-neutral-600">
                      {label}
                    </label>
                    <div className="group flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3 transition focus-within:border-[#2F8F3B]/50 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2F8F3B]/15">
                      <Icon className="h-4 w-4 shrink-0 text-neutral-400 transition group-focus-within:text-[#2F8F3B]" />
                      <input
                        type={type}
                        autoComplete={autoComplete}
                        value={values[key]}
                        onChange={(e) => setField(key, e.target.value)}
                        className="w-full min-w-0 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-neutral-600">
                    Message
                  </label>
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3 transition focus-within:border-[#2F8F3B]/50 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2F8F3B]/15">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      className="w-full resize-none bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
                      placeholder="How can we help?"
                    />
                  </div>
                </div>
              </div>

              <button
                disabled={!canSend}
                onClick={submit}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2F8F3B] py-3.5 text-sm font-bold text-white transition hover:bg-[#297D33] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send message
                  </>
                )}
              </button>

              {status === "error" && (
                <p className="mt-3 text-center text-sm text-rose-600">{statusText}</p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white">
        <Icon className="h-4 w-4 text-[#2F8F3B]" />
      </div>
      <div>
        <p className="text-xs text-neutral-400">{label}</p>
        <p className="text-sm font-semibold text-neutral-800">{value}</p>
      </div>
    </div>
  )
}
