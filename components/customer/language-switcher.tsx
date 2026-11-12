"use client"

import { useEffect, useState } from "react"
import { Globe2 } from "lucide-react"

const supportedLocales = ["en", "sw", "es", "fr", "pt", "ar", "hi", "zh"] as const
const names: Record<string, string> = {
  en: "English", sw: "Kiswahili", es: "Español", fr: "Français",
  pt: "Português", ar: "العربية", hi: "हिन्दी", zh: "中文",
}

export function LanguageSwitcher({ variant = "adaptive" }: { variant?: "adaptive" | "onDark" }) {
  const [locale, setLocale] = useState("en")
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("lang")
    let saved: string | null = null
    try { saved = JSON.parse(localStorage.getItem("flutter.locale") || "null") } catch { /* ignore */ }
    const resolved = query || saved || "en"
    if (supportedLocales.includes(resolved as typeof supportedLocales[number])) setLocale(resolved)
  }, [])

  function change(value: string) {
    setLocale(value)
    try { localStorage.setItem("flutter.locale", JSON.stringify(value)) } catch { /* ignore */ }
    const url = new URL(window.location.href)
    url.searchParams.set("lang", value)
    window.history.replaceState(null, "", url)
  }

  const isOnDark = variant === "onDark"
  return (
    <label className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm cursor-pointer ${
      isOnDark
        ? "border border-white/20 bg-black/25 text-white backdrop-blur-md"
        : "border border-black/15 bg-white/70 text-black backdrop-blur-sm dark:border-white/20 dark:bg-black/40 dark:text-white"
    }`}>
      <Globe2 className="h-4 w-4 shrink-0" />
      <select
        value={locale}
        onChange={e => change(e.target.value)}
        className="bg-transparent outline-none max-w-24 text-sm font-medium"
        aria-label="Language"
      >
        {supportedLocales.map(code => (
          <option key={code} value={code} className="text-black">{names[code]}</option>
        ))}
      </select>
    </label>
  )
}
