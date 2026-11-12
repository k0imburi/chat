"use client"

import Image from "next/image"
import Link from "next/link"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { ArrowLeft, ArrowUpRight, Globe2 } from "lucide-react"
import { normalizeLocale, supportedLocales, translate, type MessageKey, type SupportedLocale } from "@/lib/i18n"

const LocaleContext = createContext<SupportedLocale>("en")
export const publicLinks = {
  "/about": "web.about", "/terms": "web.terms", "/privacy": "web.privacy",
  "/contact": "web.contact", "/faqs": "web.faq",
} as const
const names = { en: "English", sw: "Kiswahili", es: "Español", fr: "Français", pt: "Português", ar: "العربية", hi: "हिन्दी", zh: "中文" }
export function usePublicLocale() { return useContext(LocaleContext) }
export function PublicText({ message }: { message: MessageKey }) {
  return translate(usePublicLocale(), message)
}
export function OfficialPolicyNotice() {
  const locale = usePublicLocale()
  if (locale === "en") return null
  return <p className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">{translate(locale, "web.legalNote")}</p>
}
export function PublicPageFrame({ titleKey, children }: { titleKey: MessageKey; children: ReactNode }) {
  const [locale, setLocale] = useState<SupportedLocale>("en")
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("lang")
    let saved: string | null = null
    try { saved = JSON.parse(localStorage.getItem("flutter.locale") || "null") } catch { /* Use the URL or English. */ }
    setLocale(normalizeLocale(query || saved))
  }, [])
  function changeLocale(value: string) {
    const next = normalizeLocale(value)
    setLocale(next)
    try { localStorage.setItem("flutter.locale", JSON.stringify(next)) } catch { /* Storage may be disabled. */ }
    const url = new URL(window.location.href)
    url.searchParams.set("lang", next)
    window.history.replaceState(null, "", url)
  }
  const t = (key: MessageKey) => translate(locale, key)
  return <LocaleContext.Provider value={locale}>
    <main lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} className="min-h-screen bg-[#f6f9f7] text-[#18261e]">
      <header className="sticky top-0 z-20 border-b border-emerald-950/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3 text-xl font-extrabold tracking-tight">
            <Image src="/chatandtip-logo-v2.png" width={40} height={40} alt="" className="rounded-xl" />ChatAndTip
          </Link>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 rounded-full border border-emerald-950/15 bg-white px-3 py-2 text-sm">
              <Globe2 size={17}/><span className="sr-only">{t("web.language")}</span>
              <select aria-label={t("web.language")} value={locale} onChange={event => changeLocale(event.target.value)} className="max-w-32 bg-transparent outline-none">
                {supportedLocales.map(code => <option key={code} value={code}>{names[code]}</option>)}
              </select>
            </label>
            <Link href="/" className="hidden rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 sm:block">{t("web.discover")}</Link>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-12">
        <aside>
          <nav aria-label="ChatAndTip" className="flex flex-wrap gap-2 lg:sticky lg:top-28 lg:flex-col">
            {Object.entries(publicLinks).map(([href,key]) => <Link key={href} href={`${href}?lang=${locale}`}
              aria-current={titleKey === key ? "page" : undefined}
              className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${titleKey === key ? "bg-emerald-100 text-emerald-950" : "hover:bg-white"}`}>{t(key)}</Link>)}
          </nav>
        </aside>
        <article className="min-w-0 rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-sm sm:p-10 lg:p-12">
          <Link href="/" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900"><ArrowLeft size={16}/>{t("web.back")}</Link>
          <h1 className="mb-8 text-3xl font-extrabold tracking-tight sm:text-5xl">{t(titleKey)}</h1>
          {children}
        </article>
      </div>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 pb-10 text-sm text-slate-500 sm:px-8">
        <span>© {new Date().getFullYear()} ChatAndTip</span>
        <Link href={`/download?lang=${locale}`} className="inline-flex items-center gap-2 font-semibold text-emerald-700">{t("web.download")}<ArrowUpRight size={16}/></Link>
      </footer>
    </main>
  </LocaleContext.Provider>
}
