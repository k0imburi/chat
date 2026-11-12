"use client"
import { useState, type FormEvent } from "react"
import { PublicPageFrame, usePublicLocale } from "@/components/public-page-frame"
import { translate } from "@/lib/i18n"

export default function ContactPage() {
  return <PublicPageFrame titleKey="web.contact"><ContactForm/></PublicPageFrame>
}
function ContactForm() {
  const locale = usePublicLocale()
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle")
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    setSending(true); setStatus("idle")
    try {
      const response = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error("Contact request failed")
      form.reset(); setStatus("sent")
    } catch { setStatus("error") }
    finally { setSending(false) }
  }
  return <div className="grid gap-10 xl:grid-cols-[1fr_1.3fr]">
    <div><p className="text-lg leading-8 text-slate-600">{t("web.contactBody")}</p>
      <a href="mailto:info@chatandtip.com" className="mt-6 inline-block font-bold text-emerald-700">info@chatandtip.com</a></div>
    <form onSubmit={submit} className="space-y-5">
      {([
        ["fullName", "web.name", "text", "name"],
        ["email", "auth.email", "email", "email"],
        ["phone", "web.phone", "tel", "tel"],
        ["address", "web.address", "text", "street-address"],
      ] as const).map(([name,label,type,autoComplete]) => <label key={name} className="block text-sm font-semibold">
        {t(label)}<input name={name} type={type} autoComplete={autoComplete} required maxLength={name === "address" ? 500 : name === "phone" ? 50 : 200}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"/>
      </label>)}
      <label className="block text-sm font-semibold">{t("web.message")}
        <textarea name="message" required maxLength={5000} rows={5} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"/>
      </label>
      <button disabled={sending} className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{t(sending ? "web.sending" : "web.send")}</button>
      {status !== "idle" && <p role="status" className={status === "sent" ? "text-emerald-700" : "text-red-700"}>{t(status === "sent" ? "web.sent" : "web.sendError")}</p>}
    </form>
  </div>
}
